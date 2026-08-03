import * as THREE from 'three';
import { courseById } from '../course';
import type { BuiltHole } from '../course/HoleBuilder';
import { HoleBuilder } from '../course/HoleBuilder';
import type { CourseDef, Piece, PieceKind } from '../course/types';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { THEMES } from '../render/Palette';
import type { Theme } from '../render/Palette';
import type { ToolId } from './EditorStore';
import { EditorStore } from './EditorStore';
import type { Command, EditorContext } from './commands';
import {
  AddHoleCommand,
  AddPieceCommand,
  CommandBus,
  DuplicateHoleCommand,
  DuplicatePieceCommand,
  MovePieceCommand,
  RemoveHoleCommand,
  RemovePieceCommand,
  SetAnchorCommand,
  SetCourseMetaCommand,
  SetCupCommand,
  SetHoleMetaCommand,
  SetPieceFieldCommand,
  SetTeeCommand,
} from './commands';
import { createBlankCourse, createDefaultHole } from './documents';
import { PRESET_BY_KIND } from './piecePresets';
import {
  clearDraft,
  exportCourse,
  importCourseFile,
  isCourseDef,
  removeBuiltinOverride,
  saveDocument,
  writeDraft,
  writeTestDrive,
} from './persistence';
import type { HostCallbacks } from './Panel';
import { Panel } from './Panel';
import { ANCHOR_BOUNDS, boundsForPiece, EditorViewport } from './viewport';

/**
 * Owns the editor: the viewport, the document store, the command bus and the
 * physics preview. Implements the Panel's host callbacks, so the DOM never
 * touches the scene directly.
 *
 * ### Interaction model
 * - Select tool: click a piece (or tee/cup anchor) to select; drag on a pick
 *   target to move it across the ground plane (ghost box preview); click empty
 *   ground to deselect. Orbit/pan/zoom remain OrbitControls' gestures.
 * - Place / Tee / Cup tools: the ghost preview follows the cursor; a click
 *   commits the placement.
 *
 * ### Rebuilds
 * Pieces are merged into shared buckets by HoleBuilder, so a single piece
 * cannot be moved in the scene. Dragging previews with the ghost and commits
 * the document once on release; the preview itself is rebuilt (debounced)
 * from the hole definition on every committed change.
 */

const DRAG_START_PX = 4;

type DragState =
  | {
      kind: 'piece';
      holeIndex: number;
      index: number;
      base: { x: number; y: number; z: number };
      start: THREE.Vector3;
      dx: number;
      dz: number;
    }
  | {
      kind: 'anchor';
      holeIndex: number;
      anchor: 'tee' | 'cup';
      base: { x: number; y: number; z: number };
      start: THREE.Vector3;
      dx: number;
      dz: number;
    }
  | null;

/** One undo step for a drag that moved both x and z at once. */
class MovePieceDragCommand implements Command {
  readonly label = 'Move piece';

  constructor(
    private readonly holeIndex: number,
    private readonly pieceIndex: number,
    private readonly next: { x: number; z: number },
    private readonly previous: { x: number; z: number },
  ) {}

  do(ctx: EditorContext): void {
    const piece = ctx.store.course.holes[this.holeIndex]?.pieces[this.pieceIndex];
    if (piece && 'x' in piece && 'z' in piece) {
      piece.x = this.next.x;
      piece.z = this.next.z;
    }
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const piece = ctx.store.course.holes[this.holeIndex]?.pieces[this.pieceIndex];
    if (piece && 'x' in piece && 'z' in piece) {
      piece.x = this.previous.x;
      piece.z = this.previous.z;
    }
    ctx.store.markDirty();
  }
}

const snap = (v: number, grid: number): number => Math.round(v / grid) * grid;

export class EditorHost implements HostCallbacks {
  readonly store: EditorStore;
  readonly viewport: EditorViewport;

  private readonly bus = new CommandBus();
  private readonly ctx: EditorContext;
  private readonly physics = new PhysicsWorld();
  private readonly panel: Panel;
  private built: BuiltHole | null = null;

  private press: { x: number; y: number; id: string | null; moved: boolean } | null = null;
  private drag: DragState = null;
  private gridVisible = false;
  private _snapValue = 0.25;
  /** Set by the entry point: re-open the course picker, disposing this session. */
  openPicker: (() => void) | null = null;
  private exportHandle: FileSystemFileHandle | null = null;
  private rebuildTimer: number | null = null;
  private autosaveTimer: number | null = null;
  private raf = 0;
  private lastTime = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(store: EditorStore, viewportMount: HTMLElement, panelMount: HTMLElement) {
    this.store = store;
    this.ctx = { store };
    this.viewport = new EditorViewport(viewportMount, THEMES[store.course.theme]);
    this.panel = new Panel(store, this);
    panelMount.appendChild(this.panel.element);
  }

  /** Starts event wiring and the render loop. */
  attach(): void {
    this.store.on(() => this.onStoreChanged());
    this.onStoreChanged();

    const canvas = this.viewport.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('beforeunload', this.onBeforeUnload);

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    const canvas = this.viewport.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.built?.dispose();
    this.built = null;
    this.viewport.dispose();
  }

  // --- Loop ------------------------------------------------------------------

  private loop = (time: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.elapsed += dt;
    this.viewport.frame(dt, this.elapsed, this.physics, this.built);
  };

  // --- Store -> scene --------------------------------------------------------

  private onStoreChanged(): void {
    this.updateTitle();
    this.updateSelectionOutline();
    this.scheduleRebuild();
    this.scheduleAutosave();
  }

  private updateTitle(): void {
    const name = this.store.course.name || 'Untitled';
    document.title = `${name}${this.store.dirty ? ' *' : ''} — Level Editor`;
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer !== null) return;
    this.rebuildTimer = window.setTimeout(() => this.rebuild(), 90);
  }

  private rebuild(): void {
    this.rebuildTimer = null;
    if (this.built) {
      this.built.dispose();
      this.built = null;
    }

    const hole = this.store.hole;
    if (hole) {
      const theme: Theme = THEMES[this.store.course.theme];
      this.viewport.applyTheme(theme);
      this.built = new HoleBuilder(this.physics, theme).build(hole);
      this.viewport.setBuiltGroup(this.built.group);
    } else {
      this.viewport.setBuiltGroup(null);
    }

    this.rebuildPickTargets();
    this.updateSelectionOutline();
  }

  private rebuildPickTargets(): void {
    const hole = this.store.hole;
    if (!hole) {
      this.viewport.setPickTargets([]);
      return;
    }
    const targets: Array<{ id: string; bounds: THREE.Box3 }> = [];
    hole.pieces.forEach((piece, index) => {
      targets.push({ id: `piece:${index}`, bounds: boundsForPiece(piece) });
    });
    targets.push({ id: 'tee', bounds: ANCHOR_BOUNDS(hole.tee.x, hole.tee.y, hole.tee.z) });
    targets.push({ id: 'cup', bounds: ANCHOR_BOUNDS(hole.cup.x, hole.cup.y, hole.cup.z) });
    this.viewport.setPickTargets(targets);
  }

  private updateSelectionOutline(): void {
    const selection = this.store.selection;
    const hole = this.store.hole;
    if (!selection || !hole) {
      this.viewport.setSelection(null);
      return;
    }
    if (selection.kind === 'piece') {
      const piece = hole.pieces[selection.index];
      this.viewport.setSelection(piece ? boundsForPiece(piece) : null);
    } else {
      const anchor = selection.kind === 'tee' ? hole.tee : hole.cup;
      this.viewport.setSelection(ANCHOR_BOUNDS(anchor.x, anchor.y, anchor.z), 0x66ccff);
    }
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      if (this.disposed) return;
      writeDraft(this.store.course, this.store.courseSource, this.store.holeIndex);
    }, 800);
  }

  // --- Pointer handling ------------------------------------------------------

  private toNdc(e: PointerEvent): { x: number; y: number } {
    const rect = this.viewport.domElement.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  private selectTarget(id: string): void {
    if (id === 'tee') this.store.setSelection({ kind: 'tee' });
    else if (id === 'cup') this.store.setSelection({ kind: 'cup' });
    else if (id.startsWith('piece:')) this.store.setSelection({ kind: 'piece', index: Number(id.slice(7)) });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const id = this.viewport.pickAt(this.toNdc(e));
    this.press = { x: e.clientX, y: e.clientY, id, moved: false };
    if (this.store.tool === 'select' && id !== null) this.selectTarget(id);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.drag) {
      this.updateDrag(e);
      return;
    }

    if (this.press && !this.press.moved && !this.drag) {
      const distance = Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y);
      if (distance > DRAG_START_PX) {
        this.beginDrag(this.press.id, e);
      }
    }

    // Placement ghost follows the cursor whenever the mouse is free.
    if (!this.drag) this.updateHoverGhost(e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    this.press = null;

    if (this.drag) {
      const drag = this.drag;
      this.drag = null;
      this.viewport.hideGhost();
      this.viewport.controls.enabled = true;
      this.commitDrag(drag);
      return;
    }

    if (!press || press.moved) return;

    const tool = this.store.tool;
    const hole = this.store.hole;
    if (!hole) return;

    if (tool === 'select') {
      if (press.id === null) this.store.setSelection(null);
      return;
    }

    // Placement tools: a clean click places at the snapped ground point.
    const y = tool === 'tee' ? hole.tee.y : tool === 'cup' ? hole.cup.y : 0;
    const point = this.viewport.screenToGround(this.toNdc(e), y);
    if (!point) return;
    const x = snap(point.x, this._snapValue);
    const z = snap(point.z, this._snapValue);

    if (tool === 'tee') {
      this.bus.execute(new SetTeeCommand(this.store.holeIndex, { x, y: hole.tee.y, z }), this.ctx);
    } else if (tool === 'cup') {
      this.bus.execute(new SetCupCommand(this.store.holeIndex, { x, y: hole.cup.y, z }), this.ctx);
    } else {
      this.placePiece(x, z, y);
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private basePosition(id: string): { x: number; y: number; z: number } | null {
    const hole = this.store.hole;
    if (!hole) return null;
    if (id === 'tee') return { ...hole.tee };
    if (id === 'cup') return { ...hole.cup };
    if (id.startsWith('piece:')) {
      const piece = hole.pieces[Number(id.slice(7))];
      if (!piece || !('x' in piece && 'z' in piece)) return null;
      return { x: piece.x, y: 'y' in piece ? piece.y ?? 0 : 0, z: piece.z };
    }
    return null;
  }

  private beginDrag(id: string | null, e: PointerEvent): void {
    if (!this.press) return;
    if (this.store.tool !== 'select' || id === null) return;
    const base = this.basePosition(id);
    if (!base) return;
    const start = this.viewport.screenToGround(this.toNdc(e), base.y);
    if (!start) return;

    this.press.moved = true;
    this.viewport.controls.enabled = false;
    this.drag = id.startsWith('piece:')
      ? {
          kind: 'piece',
          holeIndex: this.store.holeIndex,
          index: Number(id.slice(7)),
          base,
          start,
          dx: 0,
          dz: 0,
        }
      : {
          kind: 'anchor',
          holeIndex: this.store.holeIndex,
          anchor: id === 'tee' ? 'tee' : 'cup',
          base,
          start,
          dx: 0,
          dz: 0,
        };
    this.updateDrag(e);
  }

  private updateDrag(e: PointerEvent): void {
    if (!this.drag) return;
    const point = this.viewport.screenToGround(this.toNdc(e), this.drag.base.y);
    if (!point) return;
    const dx = snap(this.drag.base.x + point.x - this.drag.start.x, this._snapValue) - this.drag.base.x;
    const dz = snap(this.drag.base.z + point.z - this.drag.start.z, this._snapValue) - this.drag.base.z;
    if (dx === this.drag.dx && dz === this.drag.dz) return;
    this.drag.dx = dx;
    this.drag.dz = dz;

    if (this.drag.kind === 'piece') {
      const piece = this.store.hole?.pieces[this.drag.index];
      if (!piece) return;
      this.viewport.showGhostBox(boundsForPiece(piece).translate(new THREE.Vector3(dx, 0, dz)));
    } else {
      this.viewport.showGhostDisc(this.drag.base.x + dx, this.drag.base.z + dz, 0.5, this.drag.base.y);
    }
  }

  private commitDrag(drag: NonNullable<DragState>): void {
    if (drag.dx === 0 && drag.dz === 0) return;
    if (drag.kind === 'piece') {
      this.bus.execute(
        new MovePieceDragCommand(
          drag.holeIndex,
          drag.index,
          { x: drag.base.x + drag.dx, z: drag.base.z + drag.dz },
          { x: drag.base.x, z: drag.base.z },
        ),
        this.ctx,
      );
    } else {
      this.bus.execute(
        new SetAnchorCommand(drag.holeIndex, drag.anchor, {
          x: drag.base.x + drag.dx,
          y: drag.base.y,
          z: drag.base.z + drag.dz,
        }),
        this.ctx,
      );
    }
  }

  // --- Placement -------------------------------------------------------------

  private makePiece(kind: PieceKind, x: number, z: number, y: number): Piece {
    const preset = PRESET_BY_KIND.get(kind);
    const record = (preset ? structuredClone(preset.defaults) : {}) as Record<string, unknown>;
    record.kind = kind;
    record.x = x;
    record.z = z;
    record.y = y;
    return record as unknown as Piece;
  }

  private placePiece(x: number, z: number, y: number): void {
    const kind = this.store.placeKind;
    if (!kind) return;
    this.bus.execute(new AddPieceCommand(this.store.holeIndex, this.makePiece(kind, x, z, y)), this.ctx);
    const pieces = this.store.hole?.pieces;
    if (pieces) this.store.setSelection({ kind: 'piece', index: pieces.length - 1 });
  }

  private updateHoverGhost(e: PointerEvent): void {
    const tool = this.store.tool;
    const hole = this.store.hole;
    if (tool === 'select' || !hole) {
      this.viewport.hideGhost();
      return;
    }
    const y = tool === 'tee' ? hole.tee.y : tool === 'cup' ? hole.cup.y : 0;
    const point = this.viewport.screenToGround(this.toNdc(e), y);
    if (!point) return;

    if (tool === 'tee' || tool === 'cup') {
      this.viewport.showGhostDisc(snap(point.x, this._snapValue), snap(point.z, this._snapValue), 0.5, y);
      return;
    }
    if (!this.store.placeKind) return;
    this.viewport.showGhostBox(boundsForPiece(this.makePiece(this.store.placeKind, snap(point.x, this._snapValue), snap(point.z, this._snapValue), y)));
  }

  // --- Keyboard --------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === 's') {
      e.preventDefault();
      this.save();
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.bus.redo(this.ctx);
      else this.bus.undo(this.ctx);
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.bus.redo(this.ctx);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelection();
      return;
    }
    if (e.key === 'Escape') {
      this.store.setSelection(null);
      this.store.setTool('select');
      return;
    }
    if (key === 'f') {
      this.frameSelection();
      return;
    }
    if (key === 'tab') {
      e.preventDefault();
      this.cycleSelection(e.shiftKey ? -1 : 1);
      return;
    }

    // Arrow key nudging
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      const selection = this.store.selection;
      if (!selection) return;
      e.preventDefault();
      const dir = key === 'arrowup' ? { x: 0, z: -1 } :
                  key === 'arrowdown' ? { x: 0, z: 1 } :
                  key === 'arrowleft' ? { x: -1, z: 0 } :
                  { x: 1, z: 0 };
      const step = e.shiftKey ? 1 : this.snapValue;
      if (selection.kind === 'piece') {
        const piece = this.store.hole?.pieces[selection.index];
        if (piece && 'x' in piece && 'z' in piece) {
          this.bus.execute(new SetPieceFieldCommand(
            this.store.holeIndex, selection.index, 'x', piece.x + dir.x * step,
          ), this.ctx);
          this.bus.execute(new SetPieceFieldCommand(
            this.store.holeIndex, selection.index, 'z', piece.z + dir.z * step,
          ), this.ctx);
        }
      } else {
        const anchor = selection.kind;
        const hole = this.store.hole;
        if (!hole) return;
        const pos = hole[anchor];
        if (anchor === 'tee') {
          this.bus.execute(new SetTeeCommand(this.store.holeIndex, {
            x: pos.x + dir.x * step,
            y: pos.y,
            z: pos.z + dir.z * step,
          }), this.ctx);
        } else {
          this.bus.execute(new SetCupCommand(this.store.holeIndex, {
            x: pos.x + dir.x * step,
            y: pos.y,
            z: pos.z + dir.z * step,
          }), this.ctx);
        }
      }
      return;
    }

    switch (key) {
      case 'v':
        this.store.setTool('select');
        break;
      case 'b':
        this.store.setTool('place');
        break;
      case 't':
        this.store.setTool('tee');
        break;
      case 'c':
        this.store.setTool('cup');
        break;
      case 'd':
        this.duplicateSelection();
        break;
      case 'r':
        this.rotateSelection();
        break;
      case 'g':
        this.onToggleGrid();
        break;
      case 's':
        if (!mod) this.cycleSnap();
        break;
    }
  };

  private onBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (this.store.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  // --- Host callbacks --------------------------------------------------------

  onSave(): void {
    this.save();
  }

  onExport(): void {
    void this.exportCourse();
  }

  onImport(): void {
    void this.importCourse();
  }

  onTestDrive(): void {
    this.testDrive();
  }

  onNewCourse(): void {
    this.store.replaceDocument(createBlankCourse(), 'new');
    this.bus.clear();
    this.store.showToast('New course');
  }

  onOpenPicker(): void {
    this.openPicker?.();
  }

  onUndo(): void {
    this.bus.undo(this.ctx);
  }

  onRedo(): void {
    this.bus.redo(this.ctx);
  }

  onSetTool(tool: ToolId): void {
    this.store.setTool(tool);
  }

  onSelectPiece(index: number): void {
    this.store.setSelection({ kind: 'piece', index });
  }

  onSelectAnchor(id: 'tee' | 'cup'): void {
    this.store.setSelection({ kind: id });
  }

  onPlacePiece(): void {
    this.store.setPlaceKind(this.store.placeKind);
  }

  onPlaceKind(kind: PieceKind | null): void {
    this.store.setPlaceKind(kind);
  }

  onSelectHole(index: number): void {
    this.store.selectHole(index);
  }

  onAddHole(): void {
    this.bus.execute(new AddHoleCommand(createDefaultHole(this.store.course.holes.length)), this.ctx);
  }

  onRemoveHole(): void {
    if (this.store.course.holes.length <= 1) {
      this.store.showToast('A course needs at least one hole');
      return;
    }
    this.bus.execute(new RemoveHoleCommand(this.store.holeIndex), this.ctx);
  }

  onDuplicateHole(): void {
    this.bus.execute(new DuplicateHoleCommand(this.store.holeIndex), this.ctx);
  }

  onMovePiece(holeIndex: number, from: number, to: number): void {
    this.bus.execute(new MovePieceCommand(holeIndex, from, to), this.ctx);
  }

  onCommitCourseField(field: 'name' | 'tagline' | 'theme', value: string): void {
    this.bus.execute(new SetCourseMetaCommand(field, value), this.ctx);
  }

  onCommitHoleField(field: 'name' | 'par' | 'hint' | 'aim', value: string | number): void {
    this.bus.execute(new SetHoleMetaCommand(this.store.holeIndex, field, value), this.ctx);
  }

  onCommitAnchor(anchor: 'tee' | 'cup', field: 'x' | 'y' | 'z', value: number): void {
    const hole = this.store.hole;
    if (!hole) return;
    const next = { ...hole[anchor], [field]: value };
    if (anchor === 'tee') this.bus.execute(new SetTeeCommand(this.store.holeIndex, next), this.ctx);
    else this.bus.execute(new SetCupCommand(this.store.holeIndex, next), this.ctx);
  }

  onCommitPieceField(pieceIndex: number, field: string, value: unknown): void {
    this.bus.execute(new SetPieceFieldCommand(this.store.holeIndex, pieceIndex, field, value), this.ctx);
  }

  onDuplicateSelection(): void {
    this.duplicateSelection();
  }

  onRotateSelection(): void {
    this.rotateSelection();
  }

  onDeleteSelection(): void {
    this.deleteSelection();
  }

  onToggleGrid(): void {
    this.gridVisible = !this.gridVisible;
    this.viewport.setGridVisible(this.gridVisible);
  }

  onResetCourse(): void {
    this.resetCourse();
  }

  onFrameSelection(): void {
    this.frameSelection();
  }

  onSetSnap(value: number): void {
    this._snapValue = value;
    this.store.showToast(`Snap: ${value}`);
  }

  get snapValue(): number {
    return this._snapValue;
  }

  canUndo(): boolean {
    return this.bus.canUndo;
  }

  canRedo(): boolean {
    return this.bus.canRedo;
  }

  canReset(): boolean {
    return this.store.courseSource === 'builtin';
  }

  // --- Operations ------------------------------------------------------------

  private save(): void {
    saveDocument(this.store.course, this.store.courseSource);
    clearDraft();
    this.store.markClean();
    this.store.showToast(`Saved ${this.store.course.name}`);
  }

  private async exportCourse(): Promise<void> {
    const result = await exportCourse(this.store.course, this.exportHandle);
    if (!result) return;
    this.exportHandle = result.handle;
    this.store.showToast(`Exported ${result.fileName}`);
  }

  private async importCourse(): Promise<void> {
    const opened = await importCourseFile();
    if (!opened || !isCourseDef(opened.json)) {
      this.store.showToast('That file is not a valid course');
      return;
    }
    this.store.replaceDocument(opened.json as CourseDef, 'custom');
    this.bus.clear();
    this.store.showToast(`Imported ${this.store.course.name}`);
  }

  private testDrive(): void {
    saveDocument(this.store.course, this.store.courseSource);
    writeTestDrive(this.store.course, this.store.holeIndex);
    const url = `/?course=${encodeURIComponent(this.store.course.id)}&testDrive=1&return=/editor/`;
    window.open(url, '_blank');
    this.store.showToast('Playing in the game…');
  }

  private resetCourse(): void {
    if (this.store.courseSource !== 'builtin') return;
    const original = courseById(this.store.course.id);
    if (!original) return;
    removeBuiltinOverride(this.store.course.id);
    this.store.replaceDocument(structuredClone(original), 'builtin');
    this.bus.clear();
    this.store.showToast('Reverted to the built-in course');
  }

  private duplicateSelection(): void {
    const selection = this.store.selection;
    if (!selection || selection.kind !== 'piece') return;
    this.bus.execute(
      new DuplicatePieceCommand(this.store.holeIndex, selection.index, { x: 0.5, y: 0, z: 0.5 }),
      this.ctx,
    );
  }

  private rotateSelection(): void {
    const selection = this.store.selection;
    if (!selection || selection.kind !== 'piece') return;
    const piece = this.store.hole?.pieces[selection.index];
    if (!piece || !('rotY' in piece)) return;
    const rotY = ((piece.rotY ?? 0) + 90) % 360;
    this.bus.execute(new SetPieceFieldCommand(this.store.holeIndex, selection.index, 'rotY', rotY), this.ctx);
  }

  private deleteSelection(): void {
    const selection = this.store.selection;
    if (!selection) return;
    if (selection.kind === 'piece') {
      this.bus.execute(new RemovePieceCommand(this.store.holeIndex, selection.index), this.ctx);
      this.store.setSelection(null);
    } else {
      this.store.showToast('Tee and cup are required — drag or edit them instead');
    }
  }

  private frameSelection(): void {
    const selection = this.store.selection;
    const hole = this.store.hole;
    if (!hole) return;
    if (selection) {
      if (selection.kind === 'piece') {
        const piece = hole.pieces[selection.index];
        if (piece) this.viewport.frameBounds(boundsForPiece(piece));
      } else {
        const anchor = selection.kind === 'tee' ? hole.tee : hole.cup;
        this.viewport.frameBounds(ANCHOR_BOUNDS(anchor.x, anchor.y, anchor.z));
      }
    } else {
      // Frame the whole hole
      let all: THREE.Box3 | null = null;
      for (const piece of hole.pieces) {
        const b = boundsForPiece(piece);
        all = all ? all.union(b) : b;
      }
      if (all) {
        all.expandByPoint(new THREE.Vector3(hole.tee.x, hole.tee.y, hole.tee.z));
        all.expandByPoint(new THREE.Vector3(hole.cup.x, hole.cup.y, hole.cup.z));
      }
      this.viewport.frameBounds(all);
    }
  }

  private cycleSelection(direction: 1 | -1): void {
    const hole = this.store.hole;
    if (!hole || hole.pieces.length === 0) return;
    const current = this.store.selection;
    let next: number;
    if (current?.kind === 'piece') {
      next = (current.index + direction + hole.pieces.length) % hole.pieces.length;
    } else {
      next = direction > 0 ? 0 : hole.pieces.length - 1;
    }
    this.store.setSelection({ kind: 'piece', index: next });
  }

  private cycleSnap(): void {
    const options = [0.1, 0.25, 0.5, 1];
    const idx = options.indexOf(this._snapValue);
    this._snapValue = options[(idx + 1) % options.length];
    this.store.showToast(`Snap: ${this._snapValue}`);
  }
}

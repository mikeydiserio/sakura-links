import type { Piece, PieceKind } from '../course/types';
import type { ToolId } from './EditorStore';
import type { EditorStore } from './EditorStore';
import { PIECE_PRESETS, PRESET_GROUPS } from './piecePresets';
import type { FieldConfig } from './piecePresets';

/**
 * The editor's DOM panel. Plain DOM, matching the game's own UI style (no
 * framework in this project). Rebuilds its sections from the store whenever
 * anything changes; text/number inputs commit on `change` (blur), so typing
 * never triggers a rebuild under the caret.
 */

export interface HostCallbacks {
  onSave(): void;
  onExport(): void;
  onImport(): void;
  onTestDrive(): void;
  onOpenPicker(): void;
  onNewCourse(): void;
  onUndo(): void;
  onRedo(): void;
  onSetTool(tool: ToolId): void;
  onSelectPiece(index: number): void;
  onSelectAnchor(id: 'tee' | 'cup'): void;
  onPlacePiece(): void;
  onPlaceKind(kind: PieceKind | null): void;
  onSelectHole(index: number): void;
  onAddHole(): void;
  onRemoveHole(): void;
  onDuplicateHole(): void;
  onMovePiece(holeIndex: number, from: number, to: number): void;
  onCommitCourseField(field: 'name' | 'tagline' | 'theme', value: string): void;
  onCommitHoleField(field: 'name' | 'par' | 'hint' | 'aim', value: string | number): void;
  onCommitAnchor(anchor: 'tee' | 'cup', field: 'x' | 'y' | 'z', value: number): void;
  onCommitPieceField(pieceIndex: number, field: string, value: unknown): void;
  onDuplicateSelection(): void;
  onRotateSelection(): void;
  onDeleteSelection(): void;
  onToggleGrid(): void;
  onResetCourse(): void;
  onFrameSelection(): void;
  onSetSnap(value: number): void;
  canUndo(): boolean;
  canRedo(): boolean;
  canReset(): boolean;
  readonly snapValue: number;
}

const SNAP_OPTIONS = [
  { label: '0.1', value: 0.1 },
  { label: '0.25', value: 0.25 },
  { label: '0.5', value: 0.5 },
  { label: '1', value: 1 },
];

export class Panel {
  private readonly root: HTMLElement;
  private readonly paletteEl: HTMLElement;
  private readonly inspectorEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly toolbarEl: HTMLElement;
  private readonly holeBarEl: HTMLElement;

  constructor(
    private readonly store: EditorStore,
    private readonly host: HostCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'gp-panel';

    const top = document.createElement('div');
    top.className = 'gp-top';
    this.holeBarEl = document.createElement('div');
    this.holeBarEl.className = 'gp-holes';
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'gp-toolbar';
    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'gp-palette';
    const inspectorWrap = document.createElement('div');
    inspectorWrap.className = 'gp-inspector-wrap';
    this.inspectorEl = document.createElement('div');
    this.inspectorEl.className = 'gp-inspector';
    inspectorWrap.appendChild(this.inspectorEl);
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'gp-status';

    top.appendChild(this.holeBarEl);
    top.appendChild(this.toolbarEl);
    this.root.appendChild(top);
    this.root.appendChild(this.paletteEl);
    this.root.appendChild(inspectorWrap);
    this.root.appendChild(this.statusEl);

    store.on(() => {
      this.renderCourseControls();
      this.renderToolbar();
      this.renderPalette();
      this.renderInspector();
      this.renderStatus();
    });
    this.renderCourseControls();
    this.renderAll();
  }

  get element(): HTMLElement {
    return this.root;
  }

  private renderAll(): void {
    this.renderToolbar();
    this.renderPalette();
    this.renderInspector();
    this.renderStatus();
  }

  // --- Helpers --------------------------------------------------------------

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    html?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  private button(
    label: string,
    className: string,
    onClick: () => void,
    title?: string,
  ): HTMLButtonElement {
    const node = this.el('button', `gp-btn ${className}`, label);
    if (title) node.title = title;
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return node;
  }

  // --- Course name bar + hole navigation -----------------------------------

  private renderCourseControls(): void {
    const bar = this.el('div', 'gp-course');
    const name = this.el('input', 'gp-input gp-course-name') as HTMLInputElement;
    name.value = this.store.course.name;
    name.title = 'Course name';
    name.addEventListener('change', () => {
      if (name.value !== this.store.course.name) this.host.onCommitCourseField('name', name.value);
    });
    const theme = this.el('select', 'gp-input gp-theme') as HTMLSelectElement;
    for (const id of ['sakura', 'sky', 'neon']) {
      const option = this.el('option', '', id);
      option.value = id;
      theme.appendChild(option);
    }
    theme.value = this.store.course.theme;
    theme.addEventListener('change', () => this.host.onCommitCourseField('theme', theme.value));

    const holes = this.el('div', 'gp-holes-row');
    const holeSelect = this.el('select', 'gp-input gp-hole-select') as HTMLSelectElement;
    this.store.course.holes.forEach((hole, index) => {
      const option = this.el('option', '', `${index + 1}. ${hole.name}`);
      option.value = String(index);
      holeSelect.appendChild(option);
    });
    holeSelect.value = String(this.store.holeIndex);
    holeSelect.addEventListener('change', () =>
      this.host.onSelectHole(Number(holeSelect.value)),
    );
    holes.appendChild(holeSelect);
    holes.appendChild(this.button('+', 'gp-icon gp-add-hole', () => this.host.onAddHole(), 'Add hole'));
    holes.appendChild(this.button('−', 'gp-icon gp-del-hole', () => this.host.onRemoveHole(), 'Delete hole'));
    holes.appendChild(this.button('⧉', 'gp-icon', () => this.host.onDuplicateHole(), 'Duplicate hole'));

    bar.appendChild(name);
    bar.appendChild(theme);
    bar.appendChild(holes);
    this.holeBarEl.replaceChildren(bar);
  }

  // --- Toolbar --------------------------------------------------------------

  private renderToolbar(): void {
    const row = this.el('div', 'gp-row gp-actions');
    row.appendChild(this.button('Open', 'ghost', () => this.host.onOpenPicker(), 'Pick another course from the library'));
    row.appendChild(this.button('New', 'ghost', () => this.host.onNewCourse(), 'New course (replaces the working copy)'));
    const save = this.button(this.store.dirty ? 'Save*' : 'Save', 'primary', () => this.host.onSave(), 'Save (Ctrl+S)');
    row.appendChild(save);
    row.appendChild(this.button('Export', 'ghost', () => this.host.onExport(), 'Export course as JSON'));
    const reset = this.button('Reset', 'ghost', () => this.host.onResetCourse(), 'Discard edits to this built-in course');
    reset.disabled = !this.host.canReset();
    row.appendChild(reset);
    row.appendChild(this.button('Import', 'ghost', () => this.host.onImport(), 'Import a JSON course'));
    row.appendChild(this.button('Test', 'primary-test', () => this.host.onTestDrive(), 'Play this course live in the game (opens new tab)'));

    row.appendChild(this.el('span', 'gp-spacer'));
    row.appendChild(this.button('‹', 'gp-icon', () => this.host.onUndo(), 'Undo (Ctrl+Z)'));
    row.appendChild(this.button('›', 'gp-icon', () => this.host.onRedo(), 'Redo (Ctrl+Y)'));
    row.appendChild(this.button('⊞', 'gp-icon', () => this.host.onFrameSelection(), 'Frame selection (F)'));

    // Snap selector
    const snapWrap = this.el('div', 'gp-snap-wrap');
    const snapLabel = this.el('span', 'gp-snap-label', 'snap');
    snapLabel.title = 'Grid snap increment (cycle with S)';
    snapWrap.appendChild(snapLabel);
    for (const opt of SNAP_OPTIONS) {
      const btn = this.button(
        opt.label,
        `gp-snap-opt ${this.host.snapValue === opt.value ? 'active' : ''}`,
        () => this.host.onSetSnap(opt.value),
        `Snap to ${opt.label}`,
      );
      snapWrap.appendChild(btn);
    }
    row.appendChild(snapWrap);

    const strip = this.el('div', 'gp-tools');
    const toolsList: Array<[ToolId, string, string]> = [
      ['select', 'Select', 'Select and move pieces (V)'],
      ['place', 'Place', 'Place the palette piece (B)'],
      ['tee', 'Tee', 'Place the start zone (T)'],
      ['cup', 'Cup', 'Place the hole (C)'],
    ];
    for (const [id, label, title] of toolsList) {
      const btn = this.button(label, `tool ${this.store.tool === id ? 'active' : ''}`, () =>
        this.host.onSetTool(id),
        title,
      );
      strip.appendChild(btn);
    }
    const grid = this.button('grid', 'ghost toggle-grid', () => this.host.onToggleGrid(), 'Toggle the drafting grid');
    strip.appendChild(grid);

    this.toolbarEl.replaceChildren(row, strip);
  }

  // --- Palette --------------------------------------------------------------

  private renderPalette(): void {
    const wrap = this.el('div', 'gp-palette-inner');
    for (const group of PRESET_GROUPS) {
      const heading = this.el('div', 'gp-palette-group', group);
      wrap.appendChild(heading);
      const grid = this.el('div', 'gp-palette-grid');
      for (const preset of PIECE_PRESETS.filter((p) => p.group === group)) {
        const btn = this.button(
          preset.label,
          `palette-item ${this.store.placeKind === preset.kind ? 'active' : ''}`,
          () => this.host.onPlaceKind(preset.kind),
          preset.summary,
        );
        grid.appendChild(btn);
      }
      wrap.appendChild(grid);
    }
    this.paletteEl.replaceChildren(wrap);
  }

  // --- Inspector ------------------------------------------------------------

  private renderInspector(): void {
    const box = this.el('div', 'gp-inspector-body');

    const courseHeading = this.el('h3', 'gp-section', 'Course');
    box.appendChild(courseHeading);
    const courseFields = this.el('div', 'gp-fields');
    courseFields.appendChild(
      this.fieldText('Tagline', this.store.course.tagline, (value) =>
        this.host.onCommitCourseField('tagline', value),
      ),
    );
    box.appendChild(courseFields);

    const hole = this.store.hole;
    if (hole) {
      const holeHeading = this.el('h3', 'gp-section', `Hole ${this.store.holeIndex + 1}`);
      box.appendChild(holeHeading);
      const holeFields = this.el('div', 'gp-fields');
      holeFields.appendChild(
        this.fieldText('Name', hole.name, (value) =>
          this.host.onCommitHoleField('name', value),
        ),
      );
      holeFields.appendChild(
        this.fieldNumber('Par', hole.par, (value) => this.host.onCommitHoleField('par', value), 1, 1, 12),
      );
      holeFields.appendChild(
        this.fieldText('Hint', hole.hint, (value) =>
          this.host.onCommitHoleField('hint', value),
        ),
      );
      holeFields.appendChild(
        this.fieldNumber('Aim', hole.aim ?? 0, (value) => this.host.onCommitHoleField('aim', value), 0.05, -Math.PI, Math.PI, 'Starting ball direction in radians (0 = toward −Z)'),
      );
      box.appendChild(holeFields);

      const anchorSection = this.el('div', 'gp-fields');
      anchorSection.appendChild(this.el('div', 'gp-anchor-title', 'Anchors'));
      for (const anchor of ['tee', 'cup'] as const) {
        const row = this.el('div', 'gp-anchor');
        const label = this.el('span', 'gp-anchor-label', anchor === 'tee' ? 'Tee' : 'Cup');
        row.appendChild(label);
        const value = hole[anchor];
        for (const field of ['x', 'y', 'z'] as const) {
          row.appendChild(
            this.fieldNumber(
              field.toUpperCase(),
              value[field],
              (v) => this.host.onCommitAnchor(anchor, field, v),
              0.25,
              undefined,
              undefined,
            ),
          );
        }
        const selectBtn = this.button('sel', 'gp-icon', () =>
          this.host.onSelectAnchor(anchor),
          `Select ${anchor === 'tee' ? 'tee' : 'cup'}`,
        );
        row.appendChild(selectBtn);
        anchorSection.appendChild(row);
      }
      box.appendChild(anchorSection);

      // --- Piece list ------------------------------------------------------
      const pieceCount = hole.pieces.length;
      const listHeading = this.el('h3', 'gp-section', `Pieces (${pieceCount})`);
      box.appendChild(listHeading);

      if (pieceCount > 0) {
        const list = this.el('div', 'gp-piece-list');
        for (let i = 0; i < pieceCount; i++) {
          const piece = hole.pieces[i];
          const preset = PIECE_PRESETS.find((p) => p.kind === piece.kind);
          const item = this.el('div', 'gp-piece-item');
          const selectBtn = this.button(
            `${i + 1}. ${preset?.label ?? piece.kind}`,
            `gp-piece-select ${this.store.selection?.kind === 'piece' && this.store.selection.index === i ? 'active' : ''}`,
            () => this.host.onSelectPiece(i),
            `Select ${preset?.label ?? piece.kind}`,
          );
          item.appendChild(selectBtn);
          const moveUp = this.button('↑', 'gp-icon gp-sm', () => this.host.onMovePiece(this.store.holeIndex, i, Math.max(0, i - 1)), 'Move up');
          if (i === 0) moveUp.disabled = true;
          const moveDown = this.button('↓', 'gp-icon gp-sm', () => this.host.onMovePiece(this.store.holeIndex, i, Math.min(pieceCount - 1, i + 1)), 'Move down');
          if (i === pieceCount - 1) moveDown.disabled = true;
          item.appendChild(moveUp);
          item.appendChild(moveDown);
          list.appendChild(item);
        }
        box.appendChild(list);
      } else {
        box.appendChild(this.el('p', 'gp-hint', 'No pieces yet — select a tool and click the ground'));
      }
    }

    const selection = this.store.selection;
    if (selection) {
      if (selection.kind === 'piece') {
        const piece = this.store.hole?.pieces[selection.index];
        if (piece) this.renderPieceFields(box, piece, selection.index);
      } else {
        const label = selection.kind === 'tee' ? 'Tee (start zone)' : 'Cup (hole)';
        const heading = this.el('h3', 'gp-section', label);
        box.appendChild(heading);
        box.appendChild(
          this.el('p', 'gp-hint', selection.kind === 'tee' ? 'Where the ball starts each stroke' : 'Where the ball must drop'),
        );
      }
    }

    this.inspectorEl.replaceChildren(box);
  }

  private renderPieceFields(box: HTMLElement, piece: Piece, index: number): void {
    const preset = PIECE_PRESETS.find((p) => p.kind === piece.kind);
    const heading = this.el('h3', 'gp-section', `${preset?.label ?? piece.kind} #${index + 1}`);
    box.appendChild(heading);

    const actions = this.el('div', 'gp-actions');
    actions.appendChild(
      this.button('Duplicate', 'ghost', () => this.host.onDuplicateSelection(), 'Duplicate (D)'),
    );
    actions.appendChild(
      this.button('Rotate 90°', 'ghost', () => this.host.onRotateSelection(), 'Rotate yaw (R)'),
    );
    actions.appendChild(
      this.button('Delete', 'ghost', () => this.host.onDeleteSelection(), 'Delete (Del)'),
    );
    box.appendChild(actions);

    const fields = this.el('div', 'gp-fields');
    for (const config of preset?.fields ?? []) {
      fields.appendChild(this.renderField(config, piece, index));
    }
    box.appendChild(fields);
  }

  private renderField(config: FieldConfig, piece: Piece, index: number): HTMLElement {
    const value = (piece as unknown as Record<string, unknown>)[config.key];
    switch (config.type) {
      case 'number':
        return this.fieldNumber(
          config.label,
          value as number | undefined,
          (v) => this.host.onCommitPieceField(index, config.key, v),
          config.step,
          config.min,
          config.max,
          config.title,
        );
      case 'text':
        return this.fieldText(
          config.label,
          (value as string | undefined) ?? '',
          (v) => this.host.onCommitPieceField(index, config.key, v),
          config.title,
        );
      case 'select':
        return this.fieldSelect(
          config.label,
          config.options ?? [],
          (value as string | undefined) ?? config.options?.[0] ?? '',
          (v) => this.host.onCommitPieceField(index, config.key, v),
          config.title,
        );
      case 'toggle':
        return this.fieldToggle(
          config.label,
          Boolean(value),
          (v) => this.host.onCommitPieceField(index, config.key, v),
          config.title,
        );
      case 'color':
        return this.fieldColor(
          config.label,
          typeof value === 'number' ? value : undefined,
          (v) => this.host.onCommitPieceField(index, config.key, v),
          () => this.host.onCommitPieceField(index, config.key, undefined),
          config.title,
        );
      case 'textarea':
        return this.fieldPoints(
          config.label,
          config,
          piece,
          (v) => this.host.onCommitPieceField(index, config.key, v),
          config.title,
        );
    }
  }

  private renderStatus(): void {
    const count = this.store.hole?.pieces.length ?? 0;
    const parts: string[] = [`${count} pieces`, this.store.dirty ? 'unsaved changes' : 'saved'];
    if (this.store.toast) parts.unshift(`<span class="gp-toast">${this.store.toast}</span>`);
    this.statusEl.innerHTML = parts.join(' ');
  }

  // --- Field builders -------------------------------------------------------

  private field(
    labelText: string,
    input: HTMLElement,
    title?: string,
  ): HTMLElement {
    const row = this.el('div', 'gp-field');
    const label = this.el('label', 'gp-label', labelText);
    if (title) label.title = title;
    row.appendChild(label);
    input.classList.add('gp-input');
    row.appendChild(input);
    return row;
  }

  private fieldNumber(
    labelText: string,
    value: number | undefined,
    commit: (v: number) => void,
    step?: number,
    min?: number,
    max?: number,
    title?: string,
  ): HTMLElement {
    const input = this.el('input', 'gp-num') as HTMLInputElement;
    input.type = 'number';
    if (value !== undefined) input.value = String(value);
    if (step !== undefined) input.step = String(step);
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (Number.isFinite(parsed)) commit(parsed);
    });
    return this.field(labelText, input, title);
  }

  private fieldText(
    labelText: string,
    value: string,
    commit: (v: string) => void,
    title?: string,
  ): HTMLElement {
    const input = this.el('input', 'gp-text') as HTMLInputElement;
    input.type = 'text';
    input.value = value;
    input.addEventListener('change', () => commit(input.value));
    return this.field(labelText, input, title);
  }

  private fieldSelect(
    labelText: string,
    options: string[],
    value: string,
    commit: (v: string) => void,
    title?: string,
  ): HTMLElement {
    const select = this.el('select', 'gp-select') as HTMLSelectElement;
    for (const option of options) {
      const node = this.el('option', '', option);
      node.value = option;
      select.appendChild(node);
    }
    select.value = value;
    select.addEventListener('change', () => commit(select.value));
    return this.field(labelText, select, title);
  }

  private fieldToggle(
    labelText: string,
    value: boolean,
    commit: (v: boolean) => void,
    title?: string,
  ): HTMLElement {
    const input = this.el('input', 'gp-check') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => commit(input.checked));
    return this.field(labelText, input, title);
  }

  private fieldColor(
    labelText: string,
    value: number | undefined,
    commit: (v: number) => void,
    clear: () => void,
    title?: string,
  ): HTMLElement {
    const input = this.el('input', 'gp-color') as HTMLInputElement;
    input.type = 'color';
    input.value = value !== undefined ? `#${(value & 0xffffff).toString(16).padStart(6, '0')}` : '#ffffff';
    input.addEventListener('change', () => {
      const hex = input.value.replace('#', '');
      commit(parseInt(hex, 16));
    });
    const clearBtn = this.button('x', 'gp-icon gp-color-clear', clear, 'Use the theme colour');
    const wrap = this.el('div', 'gp-color-row');
    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    return this.field(labelText, wrap, title);
  }

  private fieldPoints(
    labelText: string,
    config: FieldConfig,
    piece: Piece,
    commit: (v: [number, number][]) => void,
    title?: string,
  ): HTMLElement {
    const points = (piece as unknown as Record<string, unknown>)[config.key] as [number, number][];
    const input = this.el('textarea', 'gp-text gp-points') as HTMLTextAreaElement;
    input.rows = 3;
    input.value = points.map(([x, z]) => `${x},${z}`).join(', ');
    input.addEventListener('change', () => {
      const parsed = parsePointList(input.value);
      if (parsed) {
        input.classList.remove('gp-invalid');
        commit(parsed);
      } else {
        input.classList.add('gp-invalid');
      }
    });
    return this.field(labelText, input, title);
  }
}

function parsePointList(text: string): [number, number][] | null {
  const tokens = text.split(/[,;\s]+/).filter((t) => t.length > 0);
  if (tokens.length % 2 !== 0 || tokens.length === 0) return null;
  const points: [number, number][] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number(tokens[i]);
    const z = Number(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    points.push([x, z]);
  }
  return points;
}

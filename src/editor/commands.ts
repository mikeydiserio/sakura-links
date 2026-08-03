import type { HoleDef, Piece, PieceKind, Vec3Like } from '../course/types';
import type { EditorStore } from './EditorStore';

/**
 * Undo/redo for the editor document, ported from the kitty-cat-racer editor's
 * command bus (same shape: do/undo pairs, merge keys for high-frequency
 * gestures like dragging).
 *
 * Commands mutate `store.course` — the working copy — in place. Because the
 * document is a plain data tree, every command is a small before/after pair
 * with no scene bookkeeping; the view rebuilds from the hole definition.
 */

export interface EditorContext {
  store: EditorStore;
}

export interface Command {
  readonly label: string;
  /** Commands sharing a key may coalesce into one undo step. */
  readonly mergeKey?: string;
  do(ctx: EditorContext): void;
  undo(ctx: EditorContext): void;
  /** Returns true when this command can fold into the previous one. */
  tryMerge?(next: Command): boolean;
}

export class CommandBus {
  private readonly limit: number;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(opts: { limit?: number } = {}) {
    this.limit = opts.limit ?? 200;
  }

  execute(command: Command, ctx: EditorContext): void {
    command.do(ctx);
    this.redoStack = [];

    const top = this.undoStack[this.undoStack.length - 1];
    const merged =
      top !== undefined &&
      top.mergeKey !== undefined &&
      top.mergeKey === command.mergeKey &&
      top.tryMerge?.(command) === true;
    if (!merged) {
      this.undoStack.push(command);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.notify();
  }

  undo(ctx: EditorContext): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo(ctx);
    this.redoStack.push(command);
    this.notify();
  }

  redo(ctx: EditorContext): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.do(ctx);
    this.undoStack.push(command);
    this.notify();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

// --- Course -----------------------------------------------------------------

export class SetCourseMetaCommand implements Command {
  readonly label = 'Edit course';
  private previous: unknown;

  constructor(
    private readonly field: 'name' | 'tagline' | 'theme',
    private readonly value: string,
  ) {}

  do(ctx: EditorContext): void {
    this.previous = ctx.store.course[this.field];
    ctx.store.course[this.field] = this.value as never;
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    ctx.store.course[this.field] = this.previous as never;
    ctx.store.markDirty();
  }
}

// --- Holes ------------------------------------------------------------------

export class AddHoleCommand implements Command {
  readonly label = 'Add hole';
  private readonly hole: HoleDef;

  constructor(hole: HoleDef) {
    this.hole = structuredClone(hole);
  }

  do(ctx: EditorContext): void {
    ctx.store.course.holes.push(this.hole);
    ctx.store.selectHole(ctx.store.course.holes.length - 1);
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const index = ctx.store.course.holes.indexOf(this.hole);
    if (index >= 0) ctx.store.course.holes.splice(index, 1);
    ctx.store.selectHole(ctx.store.holeIndex);
    ctx.store.markDirty();
  }
}

export class RemoveHoleCommand implements Command {
  readonly label = 'Delete hole';
  private hole: HoleDef | null = null;
  private index = -1;

  constructor(private readonly holeIndex: number) {}

  do(ctx: EditorContext): void {
    const holes = ctx.store.course.holes;
    if (this.holeIndex < 0 || this.holeIndex >= holes.length) return;
    this.hole = holes.splice(this.holeIndex, 1)[0];
    this.index = this.holeIndex;
    ctx.store.selectHole(Math.max(0, this.index - 1));
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    if (!this.hole) return;
    ctx.store.course.holes.splice(this.index, 0, this.hole);
    ctx.store.selectHole(this.index);
    ctx.store.markDirty();
  }
}

export class SetHoleMetaCommand implements Command {
  readonly label = 'Edit hole';
  private previous: unknown;

  constructor(
    private readonly holeIndex: number,
    private readonly field: 'name' | 'par' | 'hint' | 'aim',
    private readonly value: string | number,
  ) {}

  do(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    this.previous = hole[this.field];
    hole[this.field] = this.value as never;
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    hole[this.field] = this.previous as never;
    ctx.store.markDirty();
  }
}

export class SetTeeCommand implements Command {
  readonly label = 'Move tee';
  private previous: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly holeIndex: number,
    private readonly value: Vec3Like,
  ) {}

  do(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    this.previous = { ...hole.tee };
    hole.tee = { ...this.value };
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    hole.tee = this.previous;
    ctx.store.markDirty();
  }
}

export class SetCupCommand implements Command {
  readonly label = 'Move cup';
  private previous: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly holeIndex: number,
    private readonly value: Vec3Like,
  ) {}

  do(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    this.previous = { ...hole.cup };
    hole.cup = { ...this.value };
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    hole.cup = this.previous;
    ctx.store.markDirty();
  }
}

// --- Pieces -----------------------------------------------------------------

export class AddPieceCommand implements Command {
  readonly label = 'Add piece';

  constructor(
    private readonly holeIndex: number,
    private readonly piece: Piece,
  ) {}

  do(ctx: EditorContext): void {
    ctx.store.course.holes[this.holeIndex]?.pieces.push(this.piece);
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces) return;
    const index = pieces.indexOf(this.piece);
    if (index >= 0) pieces.splice(index, 1);
    ctx.store.markDirty();
  }
}

export class RemovePieceCommand implements Command {
  readonly label = 'Delete piece';
  private piece: Piece | null = null;
  private index = -1;

  constructor(
    private readonly holeIndex: number,
    private readonly pieceIndex: number,
  ) {}

  do(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces || this.pieceIndex < 0 || this.pieceIndex >= pieces.length) return;
    this.piece = pieces.splice(this.pieceIndex, 1)[0];
    this.index = this.pieceIndex;
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces || !this.piece) return;
    pieces.splice(this.index, 0, this.piece);
    ctx.store.markDirty();
  }
}

export class DuplicatePieceCommand implements Command {
  readonly label = 'Duplicate piece';
  private addedIndex = -1;

  constructor(
    private readonly holeIndex: number,
    private readonly pieceIndex: number,
    private readonly offset: Vec3Like,
  ) {}

  do(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    const source = pieces?.[this.pieceIndex];
    if (!pieces || !source) return;
    const copy = structuredClone(source) as Piece;
    if ('x' in copy && 'z' in copy) {
      copy.x += this.offset.x;
      copy.z += this.offset.z;
    }
    if ('y' in copy && copy.y !== undefined) copy.y += this.offset.y;
    pieces.splice(this.pieceIndex + 1, 0, copy);
    this.addedIndex = this.pieceIndex + 1;
    ctx.store.setSelection({ kind: 'piece', index: this.addedIndex });
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces || this.addedIndex < 0) return;
    pieces.splice(this.addedIndex, 1);
    ctx.store.setSelection({ kind: 'piece', index: this.pieceIndex });
    ctx.store.markDirty();
  }
}

/** Sets one field of one piece, coalescing drag frames. */
export class SetPieceFieldCommand implements Command {
  readonly label = 'Edit piece';
  readonly mergeKey: string;
  private previous: unknown;

  constructor(
    private readonly holeIndex: number,
    private readonly pieceIndex: number,
    private readonly field: string,
    private value: unknown,
  ) {
    this.mergeKey = `piece:${holeIndex}:${pieceIndex}:${field}`;
  }

  get currentValue(): unknown {
    return this.value;
  }

  do(ctx: EditorContext): void {
    this.apply(ctx, this.value);
  }

  undo(ctx: EditorContext): void {
    this.apply(ctx, this.previous);
  }

  tryMerge(next: Command): boolean {
    if (!(next instanceof SetPieceFieldCommand)) return false;
    this.value = next.value;
    return true;
  }

  private apply(ctx: EditorContext, value: unknown): void {
    const piece = ctx.store.course.holes[this.holeIndex]?.pieces[this.pieceIndex];
    if (!piece) return;
    const record = piece as unknown as Record<string, unknown>;
    this.previous = record[this.field];
    record[this.field] = value;
    ctx.store.markDirty();
  }
}

/** Sets `tee` or `cup` from a snapshot of the current value, merging drags. */
export class SetAnchorCommand implements Command {
  readonly label = 'Move anchor';
  readonly mergeKey: string;
  private previous: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly holeIndex: number,
    private readonly anchor: 'tee' | 'cup',
    private value: Vec3Like,
  ) {
    this.mergeKey = `anchor:${holeIndex}:${anchor}`;
  }

  do(ctx: EditorContext): void {
    this.apply(ctx, this.value);
  }

  undo(ctx: EditorContext): void {
    this.apply(ctx, this.previous);
  }

  tryMerge(next: Command): boolean {
    if (!(next instanceof SetAnchorCommand)) return false;
    this.value = next.value;
    return true;
  }

  private apply(ctx: EditorContext, value: Vec3Like): void {
    const hole = ctx.store.course.holes[this.holeIndex];
    if (!hole) return;
    this.previous = { ...hole[this.anchor] };
    hole[this.anchor] = { ...value };
    ctx.store.markDirty();
  }
}

// --- Hole operations --------------------------------------------------------

export class DuplicateHoleCommand implements Command {
  readonly label = 'Duplicate hole';
  private addedIndex = -1;

  constructor(private readonly holeIndex: number) {}

  do(ctx: EditorContext): void {
    const holes = ctx.store.course.holes;
    const source = holes[this.holeIndex];
    if (!source) return;
    const copy = structuredClone(source) as HoleDef;
    copy.id = `hole-${Date.now().toString(36)}`;
    copy.name = `${copy.name} (copy)`;
    holes.splice(this.holeIndex + 1, 0, copy);
    this.addedIndex = this.holeIndex + 1;
    ctx.store.selectHole(this.addedIndex);
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    if (this.addedIndex < 0) return;
    ctx.store.course.holes.splice(this.addedIndex, 1);
    ctx.store.selectHole(this.holeIndex);
    ctx.store.markDirty();
  }
}

export class MovePieceCommand implements Command {
  readonly label = 'Reorder piece';

  constructor(
    private readonly holeIndex: number,
    private readonly fromIndex: number,
    private readonly toIndex: number,
  ) {}

  do(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces) return;
    if (this.fromIndex < 0 || this.fromIndex >= pieces.length) return;
    if (this.toIndex < 0 || this.toIndex >= pieces.length) return;
    const [piece] = pieces.splice(this.fromIndex, 1);
    pieces.splice(this.toIndex, 0, piece);
    ctx.store.setSelection({ kind: 'piece', index: this.toIndex });
    ctx.store.markDirty();
  }

  undo(ctx: EditorContext): void {
    const pieces = ctx.store.course.holes[this.holeIndex]?.pieces;
    if (!pieces) return;
    const [piece] = pieces.splice(this.toIndex, 1);
    pieces.splice(this.fromIndex, 0, piece);
    ctx.store.setSelection({ kind: 'piece', index: this.fromIndex });
    ctx.store.markDirty();
  }
}

export type { PieceKind };

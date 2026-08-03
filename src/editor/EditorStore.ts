import type { CourseDef, PieceKind } from '../course/types';

export type ToolId = 'select' | 'place' | 'tee' | 'cup';

export type Selection = { kind: 'piece'; index: number } | { kind: 'tee' } | { kind: 'cup' };

export interface EditorState {
  /** Working copy of the document. Mutated in place by commands. */
  course: CourseDef;
  holeIndex: number;
  selection: Selection | null;
  tool: ToolId;
  placeKind: PieceKind | null;
  dirty: boolean;
  courseSource: 'builtin' | 'custom' | 'new';
  toast: string;
}

function selectionEqual(a: Selection | null, b: Selection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && (a.kind !== 'piece' || b.kind !== 'piece' || a.index === b.index);
}

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    course: CourseDef,
    openCourseSource: EditorState['courseSource'],
  ) {
    this.state = {
      course,
      holeIndex: 0,
      selection: null,
      tool: 'select',
      placeKind: 'tile',
      dirty: false,
      courseSource: openCourseSource,
      toast: '',
    };
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }

  get course(): CourseDef {
    return this.state.course;
  }

  get holeIndex(): number {
    return this.state.holeIndex;
  }

  get hole() {
    return this.state.course.holes[this.state.holeIndex];
  }

  get selection(): Selection | null {
    return this.state.selection;
  }

  get tool(): ToolId {
    return this.state.tool;
  }

  get placeKind(): PieceKind | null {
    return this.state.placeKind;
  }

  get dirty(): boolean {
    return this.state.dirty;
  }

  get courseSource(): EditorState['courseSource'] {
    return this.state.courseSource;
  }

  get toast(): string {
    return this.state.toast;
  }

  setSelection(selection: Selection | null): void {
    if (selectionEqual(this.state.selection, selection)) return;
    this.state.selection = selection;
    this.notify();
  }

  setTool(tool: ToolId): void {
    if (this.state.tool === tool) return;
    this.state.tool = tool;
    this.notify();
  }

  setPlaceKind(kind: PieceKind | null): void {
    this.state.placeKind = kind;
    this.state.tool = kind ? 'place' : this.state.tool;
    this.notify();
  }

  selectHole(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.state.course.holes.length - 1));
    if (this.state.holeIndex === clamped) return;
    this.state.holeIndex = clamped;
    this.state.selection = null;
    this.notify();
  }

  /** Swaps in a different working document (new course, reset, import). */
  replaceDocument(course: CourseDef, source: EditorState['courseSource']): void {
    this.state.course = course;
    this.state.courseSource = source;
    this.state.holeIndex = 0;
    this.state.selection = null;
    this.state.placeKind = 'tile';
    this.state.tool = 'select';
    this.state.dirty = false;
    this.notify();
  }

  markDirty(): void {
    this.state.dirty = true;
    this.notify();
  }

  markClean(): void {
    this.state.dirty = false;
    this.notify();
  }

  showToast(message: string, durationMs = 2500): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.state.toast = message;
    this.notify();
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.state.toast = '';
      this.notify();
    }, durationMs);
  }
}
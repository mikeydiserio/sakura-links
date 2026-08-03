import type { CourseDef } from '../course/types';
import { COURSES } from '../course';
import {
  EDITOR_CUSTOMS_KEY,
  EDITOR_DRAFT_KEY,
  EDITOR_OVERRIDES_KEY,
  EDITOR_TESTDRIVE_KEY,
} from './keys';
import type { EditorState } from './EditorStore';

/**
 * Editor persistence. Three stores plus a draft:
 *  - customs: completely new courses authored here, keyed by course id.
 *  - overrides: edits to the built-in courses, keyed by course id.
 *  - draft: the autosaved working document, restored when the editor returns.
 *
 * Course JSON is versioned at the top level so a future schema change can be
 * detected instead of silently mis-parsed.
 */

const VERSION = 1;

type Source = EditorState['courseSource'];

interface StoredDocument {
  version: number;
  course: CourseDef;
}

export interface DraftPayload extends StoredDocument {
  savedAt: number;
  source?: Source;
  holeIndex: number;
}

// --- Generic storage helpers ------------------------------------------------

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function readMap(key: string): Record<string, CourseDef> {
  const map = readJSON<Record<string, unknown>>(key);
  if (!map) return {};
  const out: Record<string, CourseDef> = {};
  for (const [id, value] of Object.entries(map)) {
    const course = value as CourseDef;
    if (isCourseDef(course) && course.id === id) out[id] = course;
  }
  return out;
}

export function writeCustomCourse(course: CourseDef): void {
  const map = readMap(EDITOR_CUSTOMS_KEY);
  map[course.id] = structuredClone(course);
  writeJSON(EDITOR_CUSTOMS_KEY, map);
}

export function removeCustomCourse(id: string): void {
  const map = readMap(EDITOR_CUSTOMS_KEY);
  delete map[id];
  writeJSON(EDITOR_CUSTOMS_KEY, map);
}

export function writeBuiltinOverride(course: CourseDef): void {
  const map = readMap(EDITOR_OVERRIDES_KEY);
  map[course.id] = structuredClone(course);
  writeJSON(EDITOR_OVERRIDES_KEY, map);
}

export function removeBuiltinOverride(id: string): void {
  const map = readMap(EDITOR_OVERRIDES_KEY);
  delete map[id];
  writeJSON(EDITOR_OVERRIDES_KEY, map);
}

/** Resolves a course by id across override → custom → built-in. */
export function resolveCourse(id: string): { course: CourseDef; source: Source } | null {
  const override = readMap(EDITOR_OVERRIDES_KEY)[id];
  if (override) return { course: override, source: 'builtin' };
  const custom = readMap(EDITOR_CUSTOMS_KEY)[id];
  if (custom) return { course: custom, source: 'custom' };
  const builtin = COURSES.find((course) => course.id === id);
  if (builtin) return { course: structuredClone(builtin), source: 'builtin' };
  return null;
}

export function listCustomCourses(): CourseDef[] {
  return Object.values(readMap(EDITOR_CUSTOMS_KEY)).sort((a, b) => a.name.localeCompare(b.name));
}

export function hasBuiltinOverride(id: string): boolean {
  return id in readMap(EDITOR_OVERRIDES_KEY);
}

// --- Save / load ------------------------------------------------------------

/** Persists the working copy to the right store for its source. */
export function saveDocument(course: CourseDef, source: Source): void {
  if (source === 'builtin') writeBuiltinOverride(course);
  else writeCustomCourse(course);
}

// --- Draft ------------------------------------------------------------------

export function readDraft(): DraftPayload | null {
  return readJSON<DraftPayload>(EDITOR_DRAFT_KEY);
}

export function writeDraft(
  course: CourseDef,
  source: Source,
  holeIndex: number,
  savedAt = Date.now(),
): void {
  const payload: DraftPayload = {
    version: VERSION,
    savedAt,
    course: structuredClone(course),
    source,
    holeIndex,
  };
  writeJSON(EDITOR_DRAFT_KEY, payload);
}

export function clearDraft(): void {
  localStorage.removeItem(EDITOR_DRAFT_KEY);
}

// --- Test drive -------------------------------------------------------------

export function writeTestDrive(course: CourseDef, holeIndex: number): void {
  const payload: DraftPayload = {
    version: VERSION,
    savedAt: Date.now(),
    course: structuredClone(course),
    holeIndex,
  };
  writeJSON(EDITOR_TESTDRIVE_KEY, payload);
}

export function readTestDrive(): { course: CourseDef; holeIndex: number } | null {
  const payload = readJSON<DraftPayload>(EDITOR_TESTDRIVE_KEY);
  if (!payload || payload.version !== VERSION || !isCourseDef(payload.course)) return null;
  return { course: payload.course, holeIndex: payload.holeIndex ?? 0 };
}

// --- Validation -------------------------------------------------------------

export function isCourseDef(value: unknown): value is CourseDef {
  if (!value || typeof value !== 'object') return false;
  const course = value as CourseDef;
  if (typeof course.id !== 'string' || typeof course.name !== 'string') return false;
  if (!Array.isArray(course.holes)) return false;
  if (course.theme !== 'sakura' && course.theme !== 'sky' && course.theme !== 'neon') return false;
  return course.holes.every(isHoleDef);
}

function isHoleDef(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const hole = value as CourseDef['holes'][number];
  if (typeof hole.id !== 'string' || typeof hole.name !== 'string') return false;
  if (typeof hole.par !== 'number' || !Array.isArray(hole.pieces)) return false;
  return (
    isVec3(hole.tee) &&
    isVec3(hole.cup) &&
    hole.pieces.every((piece) => piece !== null && typeof piece === 'object' && 'kind' in piece)
  );
}

function isVec3(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { x?: unknown; y?: unknown; z?: unknown };
  return typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

// --- File export / import ---------------------------------------------------

// File System Access API — Chromium only; not yet in TS lib.dom.
interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}
interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}
declare global {
  interface Window {
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  }
}

const SCENE_TYPE: FilePickerAcceptType = {
  description: 'Sakura Links course',
  accept: { 'application/json': ['.json'] },
};

export interface SaveResult {
  handle: FileSystemFileHandle | null;
  fileName: string;
}

/**
 * Export the working course as JSON. Re-uses `handle` on repeat saves;
 * falls back to a download when the FS Access API is unavailable.
 */
export async function exportCourse(
  course: CourseDef,
  handle: FileSystemFileHandle | null,
  forcePicker = false,
): Promise<SaveResult | null> {
  const json = `${JSON.stringify(course, null, 2)}\n`;
  const suggestedName = `${course.id.replace(/[^\w-]+/g, '_') || 'course'}.json`;

  if (window.showSaveFilePicker) {
    let target = handle;
    if (!target || forcePicker) {
      try {
        target = await window.showSaveFilePicker({ suggestedName, types: [SCENE_TYPE] });
      } catch {
        return null;
      }
    }
    const writable = await target.createWritable();
    await writable.write(json);
    await writable.close();
    return { handle: target, fileName: target.name };
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  URL.revokeObjectURL(url);
  return { handle: null, fileName: suggestedName };
}

export interface OpenResult {
  json: unknown;
  handle: FileSystemFileHandle | null;
  fileName: string;
}

/** Prompt for a course file. Returns null when the user cancels. */
export async function importCourseFile(): Promise<OpenResult | null> {
  if (window.showOpenFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      const handles = await window.showOpenFilePicker({ types: [SCENE_TYPE], multiple: false });
      if (!handles[0]) return null;
      handle = handles[0];
    } catch {
      return null;
    }
    const file = await handle.getFile();
    return { json: JSON.parse(await file.text()) as unknown, handle, fileName: handle.name };
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve({ json: JSON.parse(await file.text()) as unknown, handle: null, fileName: file.name });
      } catch {
        resolve({ json: undefined, handle: null, fileName: file.name });
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
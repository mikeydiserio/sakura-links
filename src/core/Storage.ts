/**
 * LocalStorage-backed persistence for progression, best rounds and settings.
 *
 * Everything is versioned and defensively parsed: a corrupt or stale blob
 * degrades to a fresh save rather than crashing the boot sequence.
 */

const SAVE_KEY = 'sakura-links/save';
const SAVE_VERSION = 1;

export interface HoleRecord {
  /** Fewest strokes ever taken on this hole. */
  bestStrokes: number;
  /** Whether the hole has been completed at least once. */
  completed: boolean;
}

export interface CourseRecord {
  completed: boolean;
  /** Best total strokes for a full round of this course. */
  bestTotal: number;
  /** Fastest completion of a full round, in seconds. */
  bestTime: number;
  holes: Record<string, HoleRecord>;
}

export interface SettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'low' | 'medium' | 'high';
  bloom: boolean;
  outlines: boolean;
  screenShake: number;
  invertAim: boolean;
  showFps: boolean;
}

export interface SaveData {
  version: number;
  courses: Record<string, CourseRecord>;
  settings: SettingsData;
  totalHolesPlayed: number;
  holesInOne: number;
}

export const DEFAULT_SETTINGS: SettingsData = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.85,
  quality: 'high',
  bloom: true,
  outlines: true,
  screenShake: 1,
  invertAim: false,
  showFps: false,
};

function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    courses: {},
    settings: { ...DEFAULT_SETTINGS },
    totalHolesPlayed: 0,
    holesInOne: 0,
  };
}

export class SaveStore {
  private data: SaveData;
  private writeTimer = 0;

  constructor() {
    this.data = SaveStore.load();
  }

  private static load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return freshSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== SAVE_VERSION) return freshSave();
      return {
        ...freshSave(),
        ...parsed,
        // Merge settings so a save written before a new option exists still boots.
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        courses: parsed.courses ?? {},
      };
    } catch {
      return freshSave();
    }
  }

  get raw(): SaveData {
    return this.data;
  }

  get settings(): SettingsData {
    return this.data.settings;
  }

  /** Debounced write — scoring updates several fields per hole. */
  save(): void {
    if (this.writeTimer) return;
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = 0;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      } catch {
        /* Quota or private-mode failures are non-fatal; play continues in-memory. */
      }
    }, 200);
  }

  course(id: string): CourseRecord {
    let record = this.data.courses[id];
    if (!record) {
      record = { completed: false, bestTotal: Infinity, bestTime: Infinity, holes: {} };
      this.data.courses[id] = record;
    }
    // `Infinity` does not survive JSON, so normalise nulls back on read.
    if (record.bestTotal === null) record.bestTotal = Infinity;
    if (record.bestTime === null) record.bestTime = Infinity;
    return record;
  }

  recordHole(courseId: string, holeId: string, strokes: number, par: number): void {
    const course = this.course(courseId);
    const hole = course.holes[holeId] ?? { bestStrokes: Infinity, completed: false };
    hole.bestStrokes = Math.min(hole.bestStrokes || Infinity, strokes);
    hole.completed = true;
    course.holes[holeId] = hole;
    this.data.totalHolesPlayed++;
    if (strokes === 1) this.data.holesInOne++;
    void par;
    this.save();
  }

  recordCourse(courseId: string, totalStrokes: number, seconds: number): void {
    const course = this.course(courseId);
    course.completed = true;
    course.bestTotal = Math.min(course.bestTotal, totalStrokes);
    course.bestTime = Math.min(course.bestTime, seconds);
    this.save();
  }

  isCourseComplete(courseId: string): boolean {
    return this.course(courseId).completed;
  }

  bestStrokes(courseId: string, holeId: string): number | null {
    const best = this.course(courseId).holes[holeId]?.bestStrokes;
    return best && Number.isFinite(best) ? best : null;
  }

  updateSettings(patch: Partial<SettingsData>): SettingsData {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  reset(): void {
    this.data = freshSave();
    this.save();
  }
}

import { SAKURA_GARDENS } from './courses/sakura';
import { SKY_ISLANDS } from './courses/skyIslands';
import { NEON_ARCADE } from './courses/neonArcade';
import type { CourseDef, HoleDef } from './types';
import type { SaveStore } from '../core/Storage';

export const COURSES: CourseDef[] = [SAKURA_GARDENS, SKY_ISLANDS, NEON_ARCADE];

/**
 * Courses injected at runtime — the level editor's test-drive payload lands
 * here before `Game` constructs, so `courseById` resolves it without changing
 * the static course list.
 */
export const CUSTOM_COURSES: CourseDef[] = [];

export const courseById = (id: string): CourseDef | undefined =>
  COURSES.find((course) => course.id === id) ?? CUSTOM_COURSES.find((course) => course.id === id);

export const holeAt = (course: CourseDef, index: number): HoleDef | undefined => course.holes[index];

/**
 * Every course is playable from the start.
 *
 * `CourseDef.requires` still records the intended order, and the save store
 * still tracks completion — both are used for progress display — but neither
 * gates access. Gating punished the player for wanting to see the course they
 * were curious about, which on a 24-hole game is a worse trade than whatever
 * sense of progression it bought.
 *
 * Kept as a function rather than deleted at the call site so the decision lives
 * in one place and can be reversed in one place.
 */
export function isCourseUnlocked(_course: CourseDef, _save: SaveStore): boolean {
  return true;
}

export type { CourseDef, HoleDef };
export { coursePar } from './types';

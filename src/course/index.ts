import { SAKURA_GARDENS } from './courses/sakura';
import { SKY_ISLANDS } from './courses/skyIslands';
import { NEON_ARCADE } from './courses/neonArcade';
import type { CourseDef, HoleDef } from './types';
import type { SaveStore } from '../core/Storage';

export const COURSES: CourseDef[] = [SAKURA_GARDENS, SKY_ISLANDS, NEON_ARCADE];

export const courseById = (id: string): CourseDef | undefined =>
  COURSES.find((course) => course.id === id);

export const holeAt = (course: CourseDef, index: number): HoleDef | undefined => course.holes[index];

/**
 * A course is playable when its prerequisite has been completed. The first
 * course has no prerequisite, so a fresh save always has somewhere to start.
 */
export function isCourseUnlocked(course: CourseDef, save: SaveStore): boolean {
  return !course.requires || save.isCourseComplete(course.requires);
}

export type { CourseDef, HoleDef };
export { coursePar } from './types';

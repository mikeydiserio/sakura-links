import type { CourseDef, HoleDef, Piece } from '../course/types';

/**
 * Document factories: the blank course and the starter hole a new document
 * begins from. The starter hole is deliberately playable — a walled green with
 * the tee north of the cup — so a brand-new course can be test-driven before
 * the author has placed a single piece.
 */

export const createDefaultHole = (index: number): HoleDef => {
  const starter: Piece = {
    kind: 'tile',
    x: 0,
    z: 0,
    y: 0,
    w: 12,
    d: 12,
    rotY: 0,
    walls: 'NSEW',
    surface: 'green',
  };
  return {
    id: `hole-${index + 1}`,
    name: `Hole ${index + 1}`,
    par: 3,
    hint: '',
    tee: { x: 0, y: 0, z: 4 },
    cup: { x: 0, y: 0, z: -4 },
    aim: Math.PI,
    pieces: [starter],
  };
};

export const createBlankCourse = (): CourseDef => ({
  id: `custom-${Date.now().toString(36)}`,
  name: 'Untitled Course',
  tagline: 'A custom course',
  theme: 'sakura',
  holes: [createDefaultHole(0)],
});

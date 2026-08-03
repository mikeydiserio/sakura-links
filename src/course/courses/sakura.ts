import type { CourseDef } from '../types';

/**
 * Course 1 — Sakura Gardens.
 *
 * Teaches the fundamentals in order: distance control (H1), carry over a hazard
 * with a safe alternative route (H2), then elevation plus a punishing surface
 * (H3). No moving parts anywhere on this course; every failure is the player's
 * read of slope and power, which is what makes it a fair tutorial.
 */
export const SAKURA_GARDENS: CourseDef = {
  id: 'sakura',
  name: 'Sakura Gardens',
  tagline: 'Stone bridges, koi ponds and a very patient wind.',
  theme: 'sakura',
  holes: [
    // ---------------------------------------------------------------- H1 ---
    {
      id: 'sakura-1',
      name: 'First Bloom',
      par: 2,
      hint: 'Roll it past the mound — the slope will bring it back toward the pin.',
      tee: { x: 0, y: 0, z: 8.4 },
      cup: { x: 0, y: 0, z: -8 },
      pieces: [
        { kind: 'tile', x: 0, z: 0, w: 6, d: 21, walls: 'NSEW' },
        // A mound directly on the putting line: the ball must be steered around
        // it or driven over the top with real pace.
        { kind: 'bump', x: 0, z: 0.5, radius: 2.1, height: 0.5 },
        { kind: 'bump', x: 0, z: -7.6, radius: 2.6, height: -0.14 },

        { kind: 'prop', type: 'torii', x: 0, z: 12.2, scale: 1.05 },
        { kind: 'prop', type: 'lantern', x: -4.4, z: 6 },
        { kind: 'prop', type: 'lantern', x: 4.4, z: -2 },
        { kind: 'prop', type: 'chime', x: -4.6, z: -6.5, rotY: 0.4 },
        { kind: 'prop', type: 'rock', x: 4.6, z: 4, scale: 1.2 },
        { kind: 'prop', type: 'rock', x: -4.2, z: -9.5, scale: 0.9 },

        { kind: 'tree', type: 'sakura', x: -6.6, z: 8, scale: 1.15 },
        { kind: 'tree', type: 'sakura', x: 7.1, z: 1.5, scale: 1.35 },
        { kind: 'tree', type: 'sakura', x: -7.4, z: -4, scale: 1 },
        { kind: 'tree', type: 'pine', x: 6.8, z: -10, scale: 0.95 },

        { kind: 'scatter', type: 'grass', x: -7.5, z: 0, w: 5, d: 24, count: 190 },
        { kind: 'scatter', type: 'grass', x: 7.5, z: 0, w: 5, d: 24, count: 190 },
        { kind: 'scatter', type: 'flowers', x: -7.5, z: 2, w: 5, d: 18, count: 60 },
        { kind: 'scatter', type: 'flowers', x: 7.5, z: -2, w: 5, d: 18, count: 60 },
      ],
    },

    // ---------------------------------------------------------------- H2 ---
    {
      id: 'sakura-2',
      name: 'Koi Crossing',
      par: 3,
      hint: 'The causeway is narrow but safe. Cutting the corner costs a stroke if you miss.',
      tee: { x: 0, y: 0, z: 9 },
      cup: { x: 2.6, y: 0, z: -9.5 },
      pieces: [
        // Tee shelf.
        { kind: 'tile', x: 0, z: 8, w: 6.5, d: 7, walls: 'SEW' },

        // The pond, and the stone causeway across it.
        { kind: 'water', x: 0, z: -1, w: 13, d: 10, y: -0.35 },
        { kind: 'tile', x: -1.4, z: -1, w: 2.4, d: 10, walls: '', surface: 'wood', color: 0xc0693f },

        // Landing green, dog-legged right toward the pin.
        { kind: 'tile', x: 0, z: -8.5, w: 9, d: 6, walls: 'NEW' },
        { kind: 'tile', x: -3.6, z: -8.5, w: 1.8, d: 6, walls: 'W' },
        { kind: 'bump', x: 2.6, z: -9.5, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'bridge', x: 3.4, z: -1, rotY: Math.PI / 2, scale: 1.1 },
        { kind: 'prop', type: 'koi', x: 2.5, z: -1, y: -0.42 },
        { kind: 'prop', type: 'koi', x: -4.2, z: 1.5, y: -0.42 },
        { kind: 'prop', type: 'lantern', x: -4.6, z: 8 },
        { kind: 'prop', type: 'lantern', x: 4.6, z: -11 },
        { kind: 'prop', type: 'bamboo', x: -6.4, z: 6 },
        { kind: 'prop', type: 'bamboo', x: 6.4, z: 5 },
        { kind: 'prop', type: 'rock', x: -6.2, z: -2, scale: 1.3 },
        { kind: 'prop', type: 'rock', x: 6.4, z: -3.5, scale: 1.1 },

        { kind: 'tree', type: 'sakura', x: -7.6, z: 9, scale: 1.2 },
        { kind: 'tree', type: 'sakura', x: 7.8, z: -8.5, scale: 1.3 },
        { kind: 'tree', type: 'pine', x: -8.2, z: -10, scale: 1.05 },

        { kind: 'scatter', type: 'grass', x: 0, z: 12.5, w: 14, d: 5, count: 120 },
        { kind: 'scatter', type: 'flowers', x: 0, z: 12.5, w: 14, d: 5, count: 46 },
        { kind: 'scatter', type: 'rocks', x: 0, z: -13, w: 16, d: 4, count: 14 },
      ],
    },

    // ---------------------------------------------------------------- H3 ---
    {
      id: 'sakura-3',
      name: 'Zen Ascent',
      par: 3,
      hint: 'Sand kills a rolling ball. Take the ramp with pace and stay left of the raked bed.',
      tee: { x: 0, y: 0, z: 10.5 },
      cup: { x: -1.2, y: 1.6, z: -9.2 },
      pieces: [
        // Lower terrace.
        { kind: 'tile', x: 0, z: 8.5, w: 6.5, d: 8, walls: 'SEW' },

        // The ramp. `tilt` lifts the north edge, so the tile's own rails climb
        // with it and the ball is guided rather than dropped off the side.
        { kind: 'tile', x: 0, z: 1.5, w: 6.5, d: 6.2, y: 0.82, tilt: 0.265, walls: 'EW' },

        // Upper terrace, split so the sand bed is flush rather than stacked.
        { kind: 'tile', x: 0, z: -3.4, w: 6.5, d: 3.4, y: 1.6, walls: 'EW' },
        { kind: 'tile', x: 1.6, z: -6.2, w: 3.3, d: 2.2, y: 1.6, surface: 'sand', walls: 'E' },
        { kind: 'tile', x: -1.85, z: -6.2, w: 2.8, d: 2.2, y: 1.6, walls: 'W' },
        { kind: 'tile', x: 0, z: -8.8, w: 6.5, d: 3, y: 1.6, walls: 'NEW' },
        { kind: 'bump', x: -1.2, z: -9.2, y: 1.6, radius: 1.9, height: -0.13 },

        { kind: 'prop', type: 'torii', x: 0, z: 12.8, scale: 1.1 },
        { kind: 'prop', type: 'pillar', x: -4.6, z: -3.4, y: 1.6 },
        { kind: 'prop', type: 'pillar', x: 4.6, z: -3.4, y: 1.6 },
        { kind: 'prop', type: 'lantern', x: 4.7, z: 8 },
        { kind: 'prop', type: 'lantern', x: -4.7, z: 8 },
        { kind: 'prop', type: 'chime', x: 4.8, z: -8.5, y: 1.6, rotY: -0.5 },
        { kind: 'prop', type: 'rock', x: -5, z: -10.5, y: 1.6, scale: 1.1 },
        { kind: 'prop', type: 'rock', x: 5.2, z: 1, scale: 1.4 },

        { kind: 'tree', type: 'sakura', x: -7.4, z: 9.5, scale: 1.25 },
        { kind: 'tree', type: 'sakura', x: 7.6, z: -6, y: 1.6, scale: 1.1 },
        { kind: 'tree', type: 'pine', x: -7.8, z: -7, y: 1.6, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 7.9, z: 8, scale: 1 },

        { kind: 'scatter', type: 'grass', x: -7.6, z: 6, w: 4.5, d: 16, count: 150 },
        { kind: 'scatter', type: 'grass', x: 7.6, z: 6, w: 4.5, d: 16, count: 150 },
        { kind: 'scatter', type: 'flowers', x: -7.6, z: -8, w: 4.5, d: 8, y: 1.6, count: 40 },
        { kind: 'scatter', type: 'flowers', x: 7.6, z: -8, w: 4.5, d: 8, y: 1.6, count: 40 },
      ],
    },

    // ---------------------------------------------------------------- H4 ---
    {
      id: 'sakura-4',
      name: 'Mossy Turn',
      par: 3,
      hint: 'Stay left of the pond and let the slope feed the ball back to the pin.',
      tee: { x: 0, y: 0, z: 9.5 },
      cup: { x: 0, y: 0, z: -8.8 },
      pieces: [
        { kind: 'tile', x: 0, z: 7.8, w: 7.2, d: 8.2, walls: 'SEW' },
        { kind: 'water', x: 0, z: -0.2, w: 10.6, d: 8.2, y: -0.35 },
        { kind: 'tile', x: -1.2, z: -0.2, w: 2.8, d: 8.2, surface: 'wood', color: 0xc0693f, walls: '' },
        { kind: 'tile', x: 0, z: -8.8, w: 8.4, d: 6.2, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -8.8, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'bridge', x: 3.3, z: -0.2, rotY: Math.PI / 2, scale: 1.05 },
        { kind: 'prop', type: 'lantern', x: -4.8, z: 7.4 },
        { kind: 'prop', type: 'lantern', x: 4.8, z: -10.2 },
        { kind: 'tree', type: 'sakura', x: -7.2, z: 7.8, scale: 1.1 },
        { kind: 'tree', type: 'pine', x: 7.4, z: -8.4, scale: 1 },
        { kind: 'scatter', type: 'flowers', x: 0, z: 11.2, w: 12, d: 4, count: 44 },
      ],
    },

    // ---------------------------------------------------------------- H5 ---
    {
      id: 'sakura-5',
      name: 'Bamboo Maze',
      par: 4,
      hint: 'The middle line is tempting, but the narrow side lane keeps it in bounds.',
      tee: { x: 0, y: 0, z: 9.2 },
      cup: { x: 2.2, y: 0, z: -9.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 7.6, w: 6.6, d: 7.2, walls: 'SEW' },
        { kind: 'tile', x: -2.2, z: -0.1, w: 2.8, d: 9.6, walls: 'W' },
        { kind: 'tile', x: 2.2, z: -0.1, w: 2.8, d: 9.6, walls: 'E' },
        { kind: 'tile', x: 0, z: -8.8, w: 8.2, d: 6.2, walls: 'NEW' },
        { kind: 'bump', x: 2.2, z: -9.2, radius: 2.1, height: -0.14 },
        { kind: 'prop', type: 'bamboo', x: -5.4, z: 4.4 },
        { kind: 'prop', type: 'bamboo', x: 5.6, z: -2.2 },
        { kind: 'prop', type: 'rock', x: -4.8, z: -10.4, scale: 1.05 },
        { kind: 'tree', type: 'pine', x: -7.2, z: -2.6, scale: 1.05 },
        { kind: 'tree', type: 'sakura', x: 7.2, z: 7.4, scale: 1.15 },
        { kind: 'scatter', type: 'grass', x: 0, z: 0, w: 13, d: 18, count: 120 },
      ],
    },

    // ---------------------------------------------------------------- H6 ---
    {
      id: 'sakura-6',
      name: 'Riverbend',
      par: 3,
      hint: 'Use the bridge as your landing zone and keep the putt on the high ground.',
      tee: { x: 0, y: 0, z: 9.8 },
      cup: { x: -1.2, y: 0, z: -9.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 7.8, w: 6.8, d: 7.6, walls: 'SEW' },
        { kind: 'water', x: 0, z: -0.3, w: 12, d: 8.8, y: -0.34 },
        { kind: 'tile', x: -1.4, z: -0.3, w: 3.2, d: 8.8, surface: 'wood', color: 0xc0693f, walls: '' },
        { kind: 'tile', x: 0, z: -8.8, w: 8.2, d: 6.2, walls: 'NEW' },
        { kind: 'bump', x: -1.2, z: -9.2, radius: 2, height: -0.14 },
        { kind: 'prop', type: 'bridge', x: 4.2, z: -0.3, rotY: Math.PI / 2, scale: 1 },
        { kind: 'prop', type: 'koi', x: 2.4, z: -0.3, y: -0.42 },
        { kind: 'prop', type: 'lantern', x: -4.8, z: 8.2 },
        { kind: 'tree', type: 'sakura', x: -7.2, z: -8.2, scale: 1.05 },
        { kind: 'tree', type: 'pine', x: 7.4, z: 7.2, scale: 1.02 },
        { kind: 'scatter', type: 'flowers', x: 0, z: 11.8, w: 10, d: 4, count: 36 },
      ],
    },

    // ---------------------------------------------------------------- H7 ---
    {
      id: 'sakura-7',
      name: 'Moon Gate',
      par: 4,
      hint: 'The raised section is the safe route; keep the ball above the sand line.',
      tee: { x: 0, y: 0, z: 10.2 },
      cup: { x: 0, y: 1.2, z: -9.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.4, w: 6.8, d: 7.2, walls: 'SEW' },
        { kind: 'tile', x: 0, z: 1.8, w: 6.2, d: 6.4, y: 0.7, tilt: 0.24, walls: 'EW' },
        { kind: 'tile', x: 0, z: -3.8, w: 6.2, d: 3.8, y: 1.2, walls: 'EW' },
        { kind: 'tile', x: 0, z: -8.8, w: 7.4, d: 3.2, y: 1.2, walls: 'NEW' },
        { kind: 'tile', x: 1.8, z: -6.6, w: 2.8, d: 2.2, y: 1.2, surface: 'sand', walls: 'E' },
        { kind: 'bump', x: 0, z: -9.6, y: 1.2, radius: 2.1, height: -0.12 },
        { kind: 'prop', type: 'torii', x: 0, z: 12.4, scale: 1.05 },
        { kind: 'prop', type: 'lantern', x: -4.7, z: 8.2 },
        { kind: 'prop', type: 'lantern', x: 4.8, z: 8.2 },
        { kind: 'tree', type: 'sakura', x: -7.4, z: -5.6, y: 1.2, scale: 1.1 },
        { kind: 'tree', type: 'pine', x: 7.4, z: -7.4, y: 1.2, scale: 1.02 },
      ],
    },

    // ---------------------------------------------------------------- H8 ---
    {
      id: 'sakura-8',
      name: 'Lantern Loop',
      par: 3,
      hint: 'The curve runs wide enough for a solid approach; don’t overcut it.',
      tee: { x: 0, y: 0, z: 9.2 },
      cup: { x: -1.2, y: 0, z: -8.8 },
      pieces: [
        { kind: 'tile', x: 0, z: 7.4, w: 6.8, d: 7.8, walls: 'SEW' },
        { kind: 'tile', x: 0, z: -0.4, w: 5.2, d: 10.8, walls: 'EW' },
        { kind: 'tile', x: 0, z: -8.8, w: 8.4, d: 6.2, walls: 'NEW' },
        { kind: 'bump', x: -1.2, z: -8.8, radius: 2.2, height: -0.15 },
        { kind: 'prop', type: 'chime', x: -4.8, z: 4.8, rotY: 0.35 },
        { kind: 'prop', type: 'lantern', x: 4.8, z: -3.2 },
        { kind: 'prop', type: 'lantern', x: -4.6, z: -9.8 },
        { kind: 'tree', type: 'sakura', x: -7.1, z: 7.4, scale: 1.12 },
        { kind: 'tree', type: 'pine', x: 7.4, z: -7.8, scale: 0.98 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.2, w: 10, d: 3.4, count: 40 },
      ],
    },
  ],
};

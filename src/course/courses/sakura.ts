import type { CourseDef } from '../types';

/**
 * Course 1 — Sakura Gardens.
 *
 * The teaching course. Nothing here moves; every hole is decided by the
 * player's read of line, pace and slope, which is what makes it a fair place to
 * learn before the later courses start taking the ball out of their hands.
 *
 * ### Authoring conventions used across all three courses
 * - **Floors are overlapping tiles with `walls: ''`.** Adjacent tiles overlap by
 *   at least 0.4u so a rolling ball can never find a seam to fall through.
 * - **Boundaries are `rail` polylines.** Tracing the outline as a polyline
 *   instead of relying on per-tile wall flags is what allows a hole to be an L,
 *   an S or a ring rather than a chain of boxes, and it means an opening is an
 *   explicit authoring decision rather than an accident of tile order.
 *   Rail centre-lines sit half a wall thickness (0.13u) outside the floor edge.
 * - **Ramps keep their own `walls`,** because a rail polyline has one height and
 *   cannot follow a slope.
 * - Every hole is verified by `__validate()` (geometry) and `__playtest()` (a
 *   bot that actually holes out).
 */
export const SAKURA_GARDENS: CourseDef = {
  id: 'sakura',
  name: 'Sakura Gardens',
  tagline: 'Stone bridges, koi ponds and a very patient wind.',
  theme: 'sakura',
  holes: [
    // ── H1 · straight lane, one mound ────────────────────────────────────────
    {
      id: 'sakura-1',
      name: 'First Bloom',
      par: 2,
      hint: 'Straight and simple. Roll past the mound and let the dish gather it in.',
      tee: { x: 0, y: 0, z: 8.4 },
      cup: { x: 0, y: 0, z: -8 },
      pieces: [
        { kind: 'tile', x: 0, z: 0, w: 6, d: 21, walls: '' },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-3.13, -10.63],
            [3.13, -10.63],
            [3.13, 10.63],
            [-3.13, 10.63],
          ],
        },

        { kind: 'bump', x: 0, z: 1.5, radius: 2.0, height: 0.42 },
        { kind: 'bump', x: 0, z: -8, radius: 2.4, height: -0.14 },

        { kind: 'prop', type: 'torii', x: 0, z: 13.6, scale: 1.05 },
        { kind: 'prop', type: 'lantern', x: -4.6, z: 6 },
        { kind: 'prop', type: 'lantern', x: 4.6, z: -2 },
        { kind: 'prop', type: 'chime', x: -4.8, z: -6.5, rotY: 0.4 },
        { kind: 'prop', type: 'rock', x: 4.8, z: 4, scale: 0.9 },

        { kind: 'tree', type: 'sakura', x: -6.8, z: 8, scale: 1.15 },
        { kind: 'tree', type: 'sakura', x: 7.2, z: 1.5, scale: 1.35 },
        { kind: 'tree', type: 'pine', x: 7, z: -10, scale: 0.95 },

        { kind: 'scatter', type: 'grass', x: -7.5, z: 0, w: 5, d: 24, count: 170 },
        { kind: 'scatter', type: 'grass', x: 7.5, z: 0, w: 5, d: 24, count: 170 },
        { kind: 'scatter', type: 'flowers', x: -7.5, z: 2, w: 5, d: 18, count: 55 },
        { kind: 'scatter', type: 'flowers', x: 7.5, z: -2, w: 5, d: 18, count: 55 },
      ],
    },

    // ── H2 · pond crossing on a narrow causeway ─────────────────────────────
    {
      id: 'sakura-2',
      name: 'Koi Crossing',
      par: 3,
      hint: 'The causeway is only two clubs wide. Line it up before you commit.',
      tee: { x: 0, y: 0, z: 8.6 },
      cup: { x: 2.2, y: 0, z: -9 },
      pieces: [
        { kind: 'tile', x: 0, z: 8, w: 6.5, d: 7, walls: '' },
        // Causeway: deliberately railless, so missing it costs a stroke.
        { kind: 'tile', x: 3.6, z: -1, w: 2.6, d: 12.4, walls: '', surface: 'wood', color: 0x9d8f78 },
        { kind: 'tile', x: 0, z: -9, w: 9, d: 6.4, walls: '' },

        { kind: 'water', x: 0, z: -1, w: 14, d: 10.4, y: -0.4 },

        {
          kind: 'rail',
          points: [
            [-3.38, 4.6],
            [-3.38, 11.63],
            [3.38, 11.63],
            [3.38, 4.6],
          ],
        },
        {
          kind: 'rail',
          points: [
            [-4.63, -5.9],
            [-4.63, -12.33],
            [4.63, -12.33],
            [4.63, -5.9],
          ],
        },

        { kind: 'bump', x: 2.2, z: -9, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'bridge', x: 3.6, z: -1, rotY: Math.PI / 2, scale: 1.1 },
        { kind: 'prop', type: 'koi', x: 2.6, z: -1, y: -0.47 },
        { kind: 'prop', type: 'koi', x: -4.4, z: 1.5, y: -0.47 },
        { kind: 'prop', type: 'lantern', x: -4.8, z: 8 },
        { kind: 'prop', type: 'lantern', x: 4.8, z: -11 },
        { kind: 'prop', type: 'bamboo', x: -6.6, z: 6 },
        { kind: 'prop', type: 'bamboo', x: 6.6, z: 5 },

        { kind: 'tree', type: 'sakura', x: -7.8, z: 9, scale: 1.2 },
        { kind: 'tree', type: 'sakura', x: 8, z: -8.5, scale: 1.3 },
        { kind: 'tree', type: 'pine', x: -8.4, z: -10, scale: 1.05 },

        // Split around the camera lane: the aim camera sits 3-6u behind the tee
        // on the tee-cup axis, and a strip spanning that line puts blades right
        // against the lens with the whole fairway behind them.
        { kind: 'scatter', type: 'grass', x: -4.5, z: 13, w: 5, d: 4, count: 55 },
        { kind: 'scatter', type: 'grass', x: 4.5, z: 13, w: 5, d: 4, count: 55 },
        { kind: 'scatter', type: 'flowers', x: -4.5, z: 13, w: 5, d: 4, count: 22 },
        { kind: 'scatter', type: 'flowers', x: 4.5, z: 13, w: 5, d: 4, count: 22 },
        { kind: 'scatter', type: 'rocks', x: 0, z: -13.6, w: 16, d: 3, count: 12 },
      ],
    },

    // ── H3 · ramp to a terrace guarded by raked sand ────────────────────────
    {
      id: 'sakura-3',
      name: 'Zen Ascent',
      par: 3,
      hint: 'Sand kills a rolling ball. Take the ramp with pace, then stay west of the raked bed.',
      tee: { x: 0, y: 0, z: 10.5 },
      cup: { x: -1.6, y: 1.6, z: -9.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.5, w: 6.5, d: 8, walls: '' },
        // The ramp keeps per-tile walls: a rail polyline has one height and
        // cannot climb with it.
        // Longer and shallower than it looks like it needs to be: 0.24 rad is
        // the steepest ramp the 0.85 rails can contain at full power.
        { kind: 'tile', x: 0, z: 1.9, w: 6.5, d: 9.4, y: 0.60, tilt: 0.18, walls: 'EW' },
        // On the flat approach, not on the ramp. A booster pad is a flat slab
        // and the ramp is a 0.18 rad slope, so the pad now feeds pace onto the
        // climb without being buried by the hill.
        { kind: 'booster', x: 0, z: 5.2, y: 0, rotY: 0, w: 3.8, d: 3.8, power: 20 },
        { kind: 'tile', x: 0, z: -1.05, w: 6.5, d: 3.4, y: 1.6, walls: '', surface: 'wood', color: 0x9d8f78 },

        // Upper terrace. Its south edge sits just uphill of the ramp end, so the
        // landing has a wide, flat catch before the sand bed.
        { kind: 'tile', x: -2.1, z: -4.35, w: 2.3, d: 6.1, y: 1.6, walls: '' },
        { kind: 'tile', x: 0.55, z: -4.35, w: 3, d: 6.1, y: 1.6, surface: 'sand', walls: '' },
        { kind: 'tile', x: 2.65, z: -4.35, w: 1.2, d: 6.1, y: 1.6, walls: '' },
        { kind: 'tile', x: 0, z: -9.6, w: 6.5, d: 5.6, y: 1.6, walls: '' },

        {
          kind: 'rail',
          points: [
            [-3.38, 4.6],
            [-3.38, 12.63],
            [3.38, 12.63],
            [3.38, 4.6],
          ],
        },
        {
          kind: 'rail',
          y: 1.6,
          points: [
            [-3.38, -1.2],
            [-3.38, -12.33],
            [3.38, -12.33],
            [3.38, -1.2],
          ],
        },

        { kind: 'bump', x: -1.6, z: -9.6, y: 1.6, radius: 1.9, height: -0.13 },

        { kind: 'prop', type: 'torii', x: 0, z: 14, scale: 1.1 },
        { kind: 'prop', type: 'pillar', x: -4.6, z: -3.4, y: 1.6 },
        { kind: 'prop', type: 'pillar', x: 4.6, z: -3.4, y: 1.6 },
        { kind: 'prop', type: 'lantern', x: 4.9, z: 8 },
        { kind: 'prop', type: 'lantern', x: -4.9, z: 8 },
        { kind: 'prop', type: 'chime', x: 5, z: -8.5, y: 1.6, rotY: -0.5 },
        { kind: 'prop', type: 'rock', x: -5.2, z: -10.5, y: 1.6, scale: 0.9 },

        { kind: 'tree', type: 'sakura', x: -7.6, z: 9.5, scale: 1.25 },
        { kind: 'tree', type: 'pine', x: -8, z: -7, y: 1.6, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 8.1, z: 8, scale: 1 },

        { kind: 'scatter', type: 'grass', x: -7.8, z: 6, w: 4.5, d: 16, count: 140 },
        { kind: 'scatter', type: 'grass', x: 7.8, z: 6, w: 4.5, d: 16, count: 140 },
        { kind: 'scatter', type: 'flowers', x: -7.8, z: -8, w: 4.5, d: 8, y: 1.6, count: 36 },
      ],
    },

    // ── H4 · L-shaped dogleg around a rock garden ───────────────────────────
    {
      id: 'sakura-4',
      name: 'Mossy Turn',
      par: 3,
      hint: 'Bank it off the far rail at the elbow — the corner is faster than it looks.',
      tee: { x: -3, y: 0, z: 10 },
      cup: { x: 4.2, y: 0, z: -3.4 },
      pieces: [
        // South leg, running north.
        { kind: 'tile', x: -3, z: 5.6, w: 5, d: 13.2, walls: '' },
        // Elbow, then the east leg.
        { kind: 'tile', x: -3, z: -3.4, w: 5, d: 5.6, walls: '' },
        { kind: 'tile', x: 2.9, z: -3.4, w: 7.2, d: 5.6, walls: '' },

        {
          kind: 'rail',
          closed: true,
          points: [
            [-5.63, 12.33],
            [-5.63, -6.33],
            [6.63, -6.33],
            [6.63, -0.47],
            [-0.37, -0.47],
            [-0.37, 12.33],
          ],
        },

        { kind: 'bump', x: -3, z: 2.5, radius: 1.7, height: 0.34 },
        { kind: 'bump', x: 4.2, z: -3.4, radius: 2, height: -0.15 },

        { kind: 'prop', type: 'rock', x: 1.8, z: 2.4, scale: 1.5 },
        { kind: 'prop', type: 'rock', x: 4.4, z: 1.6, scale: 1.1 },
        { kind: 'prop', type: 'rock', x: 3.2, z: 4.4, scale: 0.85 },
        { kind: 'prop', type: 'lantern', x: -6.8, z: 8 },
        { kind: 'prop', type: 'lantern', x: 7.8, z: -4 },
        { kind: 'prop', type: 'chime', x: -6.9, z: -4, rotY: 0.7 },

        { kind: 'tree', type: 'sakura', x: 5.2, z: 5.4, scale: 1.25 },
        { kind: 'tree', type: 'sakura', x: -7.6, z: 2, scale: 1.05 },
        { kind: 'tree', type: 'pine', x: -7.4, z: 11, scale: 1.1 },

        { kind: 'scatter', type: 'rocks', x: 3, z: 3, w: 7, d: 6, count: 10 },
        { kind: 'scatter', type: 'grass', x: 3, z: 3, w: 7, d: 6, count: 90 },
        { kind: 'scatter', type: 'flowers', x: -8, z: 4, w: 3.5, d: 14, count: 40 },
      ],
    },

    // ── H5 · S-curve chicane between bamboo stands ──────────────────────────
    {
      id: 'sakura-5',
      name: 'Bamboo Chicane',
      par: 4,
      hint: 'Two turns, no shortcuts. Half power into each bend keeps you off the rails.',
      tee: { x: -3.4, y: 0, z: 11 },
      cup: { x: 3.6, y: 0, z: -10.4 },
      pieces: [
        { kind: 'tile', x: -3.4, z: 8.4, w: 4.6, d: 8.4, walls: '' },
        { kind: 'tile', x: 0, z: 3.4, w: 11.4, d: 4.6, walls: '' },
        { kind: 'tile', x: 3.6, z: -2, w: 4.6, d: 8.4, walls: '' },
        { kind: 'tile', x: 3.6, z: -8.6, w: 4.6, d: 5.4, walls: '' },

        {
          kind: 'rail',
          closed: true,
          points: [
            [-5.83, 12.73],
            [-5.83, 1.03],
            [1.17, 1.03],
            [1.17, -11.43],
            [5.93, -11.43],
            [5.93, 5.83],
            [-1.07, 5.83],
            [-1.07, 12.73],
          ],
        },

        { kind: 'bump', x: 3.6, z: -10.4, radius: 1.9, height: -0.15 },
        { kind: 'bump', x: -3.4, z: 6, radius: 1.5, height: 0.3 },

        { kind: 'prop', type: 'bamboo', x: -1.9, z: 8.6 },
        { kind: 'prop', type: 'bamboo', x: 2.6, z: 3.4 },
        { kind: 'prop', type: 'bamboo', x: -7.4, z: 6 },
        { kind: 'prop', type: 'bamboo', x: 7.4, z: -2 },
        { kind: 'prop', type: 'lantern', x: -7.2, z: 11 },
        { kind: 'prop', type: 'lantern', x: 7.4, z: -10 },
        { kind: 'prop', type: 'chime', x: 0, z: -8, rotY: 0.2 },

        { kind: 'tree', type: 'sakura', x: -1.6, z: -6, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 8.2, z: 4, scale: 1.15 },

        { kind: 'scatter', type: 'grass', x: -2, z: -7, w: 5, d: 9, count: 110 },
        { kind: 'scatter', type: 'flowers', x: -2, z: -7, w: 5, d: 9, count: 34 },
      ],
    },

    // ── H6 · crescent around a water inlet ──────────────────────────────────
    {
      id: 'sakura-6',
      name: 'Riverbend',
      par: 4,
      hint: 'A bay sits in the middle of the fairway. Go round it — either side works.',
      tee: { x: -4.2, y: 0, z: 10.4 },
      cup: { x: -4.2, y: 0, z: -8.6 },
      pieces: [
        // A C around a bay. The floor is a continuous ring; the water fills the
        // hollow it encloses, so the only thing between the tee and the pin is
        // the decision of how much of the corner to cut.
        { kind: 'tile', x: -4.2, z: 6.4, w: 5.2, d: 11.6, walls: '' },
        { kind: 'tile', x: 0.6, z: 3.2, w: 14.4, d: 5.2, walls: '' },
        { kind: 'tile', x: 5.2, z: -3.4, w: 5.2, d: 8.2, walls: '' },
        { kind: 'tile', x: 0.6, z: -8, w: 14.4, d: 5.2, walls: '' },
        // West band, closing the ring. Without it the fairway is a C and the
        // whole west flank of the bay is void rather than water.
        { kind: 'tile', x: -4.2, z: -2.4, w: 5.2, d: 6.4, walls: '' },

        // The bay fills exactly the hollow the ring encloses.
        { kind: 'water', x: 0.5, z: -2.4, w: 4.2, d: 6, y: -0.4 },

        {
          kind: 'rail',
          closed: true,
          points: [
            [-6.93, 12.33],
            [-1.47, 12.33],
            [-1.47, 5.93],
            [7.93, 5.93],
            [7.93, -10.73],
            [-6.93, -10.73],
          ],
        },
        // Kerb around the bay so the ball is turned away rather than swallowed
        // whenever it merely brushes the edge.
        {
          kind: 'rail',
          closed: true,
          height: 0.34,
          points: [
            [-1.73, 0.73],
            [2.73, 0.73],
            [2.73, -5.53],
            [-1.73, -5.53],
          ],
        },

        { kind: 'bump', x: -4.2, z: -8.6, radius: 2, height: -0.16 },

        { kind: 'prop', type: 'koi', x: 0.5, z: -2.4, y: -0.47 },
        { kind: 'prop', type: 'lantern', x: -8.6, z: 8 },
        { kind: 'prop', type: 'lantern', x: 9.4, z: -4 },
        { kind: 'prop', type: 'bamboo', x: 9.2, z: 6 },
        { kind: 'prop', type: 'rock', x: 0.6, z: -12.4, scale: 1.2 },

        { kind: 'tree', type: 'sakura', x: -8.4, z: 2, scale: 1.3 },
        { kind: 'tree', type: 'pine', x: 8.4, z: -10, scale: 1.1 },

        // This tee sits at x = -4.2, so the gap goes there rather than at x = 0.
        { kind: 'scatter', type: 'grass', x: -8.4, z: 13, w: 3.6, d: 3.5, count: 34 },
        { kind: 'scatter', type: 'grass', x: 1.4, z: 13, w: 8.4, d: 3.5, count: 56 },
        { kind: 'scatter', type: 'flowers', x: -8.4, z: 13, w: 3.6, d: 3.5, count: 12 },
        { kind: 'scatter', type: 'flowers', x: 1.4, z: 13, w: 8.4, d: 3.5, count: 20 },
      ],
    },

    // ── H7 · split route through a moon gate ────────────────────────────────
    {
      id: 'sakura-7',
      name: 'Moon Gate',
      par: 3,
      hint: 'Thread the gate for a look at the pin, or take the long way round and play safe.',
      tee: { x: 0, y: 0, z: 11 },
      cup: { x: 0, y: 0, z: -9.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.4, w: 11, d: 7.6, walls: '' },
        // One continuous floor across the whole middle. The three lanes are
        // made by the rail dividers below, not by separate tiles — leaving the
        // strips between lanes as void would drop the ball through a hole the
        // player has no way to see.
        { kind: 'tile', x: 0, z: 0.1, w: 11, d: 9.8, walls: '' },
        { kind: 'tile', x: 0, z: -8.4, w: 11, d: 8, walls: '' },

        {
          kind: 'rail',
          closed: true,
          points: [
            [-5.63, 12.33],
            [5.63, 12.33],
            [5.63, -12.53],
            [-5.63, -12.53],
          ],
        },
        // The two spurs that create three lanes.
        {
          kind: 'rail',
          points: [
            [-1.43, 4.9],
            [-1.43, -4.4],
          ],
        },
        {
          kind: 'rail',
          points: [
            [1.43, 4.9],
            [1.43, -4.4],
          ],
        },
        {
          kind: 'rail',
          points: [
            [-2.77, 4.9],
            [-2.77, -4.4],
          ],
        },
        {
          kind: 'rail',
          points: [
            [2.77, 4.9],
            [2.77, -4.4],
          ],
        },

        { kind: 'bump', x: 0, z: -9.6, radius: 2.3, height: -0.16 },

        { kind: 'prop', type: 'torii', x: 0, z: 4.6, scale: 0.8 },
        { kind: 'prop', type: 'lantern', x: -4.2, z: -6 },
        { kind: 'prop', type: 'lantern', x: 4.2, z: -6 },
        { kind: 'prop', type: 'chime', x: -7, z: 2, rotY: 0.5 },
        { kind: 'prop', type: 'rock', x: 7.2, z: 7, scale: 1.1 },

        { kind: 'tree', type: 'sakura', x: -7.8, z: 9, scale: 1.25 },
        { kind: 'tree', type: 'sakura', x: 7.8, z: -9, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: -8, z: -6, scale: 1 },

        { kind: 'scatter', type: 'grass', x: -7.6, z: 0, w: 3.5, d: 22, count: 120 },
        { kind: 'scatter', type: 'grass', x: 7.6, z: 0, w: 3.5, d: 22, count: 120 },
        { kind: 'scatter', type: 'flowers', x: 7.6, z: 4, w: 3.5, d: 12, count: 36 },
      ],
    },

    // ── H8 · ring around a central island ───────────────────────────────────
    {
      id: 'sakura-8',
      name: 'Lantern Loop',
      par: 3,
      hint: 'Either way round the island works. Left is shorter; right is kinder.',
      tee: { x: 0, y: 0, z: 10 },
      cup: { x: 0, y: 0, z: -9.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.6, w: 12.4, d: 5.6, walls: '' },
        { kind: 'tile', x: -4.6, z: 0.4, w: 3.2, d: 12.4, walls: '' },
        { kind: 'tile', x: 4.6, z: 0.4, w: 3.2, d: 12.4, walls: '' },
        { kind: 'tile', x: 0, z: -8, w: 12.4, d: 5.6, walls: '' },

        // Outer boundary.
        {
          kind: 'rail',
          closed: true,
          points: [
            [-6.33, 11.53],
            [6.33, 11.53],
            [6.33, -10.93],
            [-6.33, -10.93],
          ],
        },
        // The island in the middle, which the ball must go around.
        {
          kind: 'rail',
          closed: true,
          points: [
            [-2.87, 5.67],
            [2.87, 5.67],
            [2.87, -5.07],
            [-2.87, -5.07],
          ],
        },

        { kind: 'bump', x: 0, z: -9.4, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'lantern', x: 0, z: 0.3, scale: 1.6 },
        { kind: 'prop', type: 'lantern', x: -1.8, z: 3.6 },
        { kind: 'prop', type: 'lantern', x: 1.8, z: -3 },
        { kind: 'prop', type: 'rock', x: 1.6, z: 3.4, scale: 0.8 },
        { kind: 'prop', type: 'rock', x: -1.6, z: -3.2, scale: 0.9 },
        { kind: 'prop', type: 'chime', x: -7.6, z: 6, rotY: 0.4 },
        { kind: 'prop', type: 'chime', x: 7.6, z: -6, rotY: -0.4 },

        { kind: 'tree', type: 'sakura', x: 0, z: -0.4, scale: 1.05 },
        { kind: 'tree', type: 'sakura', x: -8.6, z: 9, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 8.6, z: -9, scale: 1.1 },

        { kind: 'scatter', type: 'grass', x: 0, z: 0.3, w: 5, d: 10, count: 70 },
        { kind: 'scatter', type: 'flowers', x: 0, z: 0.3, w: 5, d: 10, count: 40 },
        { kind: 'scatter', type: 'flowers', x: -4.5, z: 13.4, w: 5, d: 3, count: 15 },
        { kind: 'scatter', type: 'flowers', x: 4.5, z: 13.4, w: 5, d: 3, count: 15 },
      ],
    },
  ],
};

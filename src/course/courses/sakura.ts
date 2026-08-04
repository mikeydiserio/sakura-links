import type { CourseDef } from '../types';

/**
 * Course 1 — Sakura Gardens.
 *
 * The teaching course, and the only one with no moving parts at all. Every hole
 * is decided by the player's read of shape, slope, water and sand, which makes
 * it a fair place to learn before Sky Islands starts taking the ball out of
 * their hands.
 *
 * ### Authoring conventions
 * Not style preferences — each one is a bug that made a hole unfinishable:
 *
 * - **Floors are overlapping `tile` pieces with `walls: ''`, overlapping by at
 *   least 0.4u.** A thinner seam is a lip the ball catches on.
 * - **Boundaries are `rail` polylines, never per-tile `walls`.** A `walls`
 *   letter builds a solid box just outside that tile's edge, so the moment a
 *   tile is grown to overlap its neighbour the wall stops being a boundary and
 *   becomes an invisible barrier standing in open fairway — every static check
 *   still passes and the ball simply refuses to travel. Rails trace the true
 *   outline of an L, an S or a ring and cannot make that mistake. Rail
 *   centre-lines sit 0.13u outside the floor edge.
 * - **Ramps keep their own `walls: 'EW'`,** because a rail has one height and
 *   cannot climb. A ramp's depth is *solved*, never chosen: `d = rise / sin(tilt)`
 *   with the tile's `y` at half the rise, so it meets the upper deck at exactly
 *   the deck's height right where that deck's edge begins. End the climb
 *   underneath the deck instead and the deck's side face stands proud of the
 *   slope as a step the ball stalls dead against.
 * - **`tilt` never exceeds 0.24 rad.** Rails are 1.05 tall, sized so a
 *   full-power ball at 26 u/s off a 0.24 ramp rises 0.96 and stays in. Steeper
 *   throws the ball out of the course. Gentler is also easier to climb: a ball
 *   meeting a steep foot converts v*sin(tilt) straight upward and lands halfway
 *   up with its pace spent.
 * - **No tall prop sits 3-7u behind the tee** on the tee-to-cup line. The aim
 *   camera stands there, and a prop in that lane hides the whole hole.
 */
export const SAKURA_GARDENS: CourseDef = {
  id: 'sakura',
  name: 'Sakura Gardens',
  tagline: 'Stone bridges, koi ponds and a very patient wind.',
  theme: 'sakura',
  holes: [
    // -- H1 . Punchbowl: an L-bend into a green that gathers ----------------
    {
      id: 'sakura-1',
      name: 'Still Water',
      par: 2,
      hint: 'Turn the corner and trust the bowl. Anything near the middle feeds in.',
      tee: { x: -4, y: 0, z: 8.5 },
      cup: { x: 2, y: 0, z: -6.5 },
      pieces: [
        { kind: 'tile', x: -4, z: 3.5, w: 5, d: 12, walls: '' },
        { kind: 'tile', x: 2, z: -6.5, w: 11, d: 9, walls: '' },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-6.63, 9.63],
            [-1.37, 9.63],
            [-1.37, -1.87],
            [7.63, -1.87],
            [7.63, -11.13],
            [-3.63, -11.13],
            [-3.63, -2.63],
            [-6.63, -2.63],
          ],
        },
        // The bowl is the whole hole: it forgives line but not pace, which is
        // the first thing a player has to learn.
        { kind: 'bump', x: 2, z: -6.5, radius: 4.2, height: -0.42 },

        { kind: 'prop', type: 'lantern', x: -8.4, z: 6 },
        { kind: 'prop', type: 'lantern', x: 9.4, z: -8 },
        { kind: 'prop', type: 'rock', x: 5.6, z: 1.5, scale: 1.1 },
        { kind: 'tree', type: 'sakura', x: -9, z: 1, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 9.6, z: -1, scale: 1 },
        { kind: 'scatter', type: 'grass', x: -9, z: 4, w: 4, d: 16, count: 120 },
        { kind: 'scatter', type: 'flowers', x: 9.4, z: -6, w: 4, d: 12, count: 44 },
      ],
    },

    // -- H2 . Cape: dogleg around water; cut the corner or go round ---------
    {
      id: 'sakura-2',
      name: 'Koi Cape',
      par: 3,
      hint: 'The short line crosses the pond. The safe line goes the long way and always works.',
      tee: { x: -5, y: 0, z: 9 },
      cup: { x: 5, y: 0, z: -7.5 },
      pieces: [
        { kind: 'tile', x: -5, z: 4.5, w: 5, d: 11, walls: '' },
        { kind: 'tile', x: -1, z: -3, w: 13, d: 6, walls: '' },
        { kind: 'tile', x: 5, z: -7.5, w: 8, d: 7, walls: '' },
        // The pond fills the inside of the dogleg, so cutting the corner is a
        // genuine carry rather than a shortcut across grass.
        { kind: 'water', x: 2.5, z: 4.5, w: 9, d: 9, y: -0.35 },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-7.63, 10.13],
            [-2.37, 10.13],
            [-2.37, 0.13],
            [5.63, 0.13],
            [5.63, -3.87],
            [9.13, -3.87],
            [9.13, -11.13],
            [0.87, -11.13],
            [0.87, -5.87],
            [-7.63, -5.87],
          ],
        },
        { kind: 'bump', x: 5, z: -7.5, radius: 2.6, height: -0.2 },

        { kind: 'prop', type: 'koi', x: 1.5, z: 4, y: -0.42 },
        { kind: 'prop', type: 'koi', x: 4.5, z: 6, y: -0.42 },
        { kind: 'prop', type: 'lantern', x: -9, z: 7 },
        { kind: 'prop', type: 'bamboo', x: -9.2, z: 0 },
        { kind: 'tree', type: 'sakura', x: -9.6, z: 4, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 11, z: -8, scale: 1.05 },
        { kind: 'scatter', type: 'grass', x: -9.6, z: -2, w: 4, d: 10, count: 90 },
        { kind: 'scatter', type: 'flowers', x: 5, z: -13.4, w: 10, d: 3, count: 40 },
      ],
    },

    // -- H3 . Split fairway: two lanes, one short and mean ------------------
    {
      id: 'sakura-3',
      name: 'Two Paths',
      par: 3,
      hint: 'Narrow left is a stroke shorter. Wide right always gets there.',
      tee: { x: 0, y: 0, z: 10 },
      cup: { x: -3.4, y: 0, z: -8.5 },
      pieces: [
        { kind: 'tile', x: 0, z: 9, w: 9, d: 6, walls: '' },
        // Left lane: barely two ball-widths, and the cup sits on its axis.
        { kind: 'tile', x: -3.4, z: 1, w: 2.6, d: 13, walls: '' },
        // Right lane: twice as wide, but it arrives from the far side.
        { kind: 'tile', x: 3.6, z: 1, w: 5, d: 13, walls: '' },
        { kind: 'tile', x: 0, z: -8.5, w: 12, d: 7, walls: '' },
        {
          kind: 'rail',
          points: [
            [-6.13, 12.13],
            [6.23, 12.13],
            [6.23, -12.13],
            [-6.13, -12.13],
            [-6.13, 12.13],
          ],
        },
        // The divider between the two lanes is water, not bare void — the cost
        // of drifting off either lane is a stroke either way, but a pond reads
        // as a hazard at a glance where a hole in the ground does not.
        { kind: 'water', x: -0.5, z: 0.5, w: 2.94, d: 10.74, y: -0.35 },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-1.97, 5.87],
            [0.97, 5.87],
            [0.97, -4.87],
            [-1.97, -4.87],
          ],
        },
        { kind: 'bump', x: -3.4, z: -8.5, radius: 2.4, height: -0.2 },

        { kind: 'prop', type: 'lantern', x: -8.4, z: 6 },
        { kind: 'prop', type: 'lantern', x: 8.6, z: 6 },
        { kind: 'prop', type: 'rock', x: -0.5, z: 2, scale: 0.9 },
        { kind: 'tree', type: 'sakura', x: -9.6, z: -1, scale: 1.15 },
        { kind: 'tree', type: 'pine', x: 9.8, z: -2, scale: 1 },
        { kind: 'scatter', type: 'grass', x: -9.4, z: 3, w: 4, d: 14, count: 100 },
        { kind: 'scatter', type: 'grass', x: 9.6, z: 3, w: 4, d: 14, count: 100 },
      ],
    },

    // -- H4 . Alps: climb to a blind crest, green hidden beyond -------------
    {
      id: 'sakura-4',
      name: 'Blind Rise',
      par: 3,
      hint: 'You cannot see the green from the tee. Commit to the line over the crest.',
      tee: { x: 0, y: 0, z: 11 },
      cup: { x: 3.2, y: 0, z: -9 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.5, w: 7, d: 7, walls: '' },
        // Rise 1.1 at 0.2 rad: d = 1.1 / sin(0.2) = 5.54, centre y at half the
        // rise, so the foot meets 0 and the head meets 1.1 exactly.
        { kind: 'tile', x: 0, z: 3.75, w: 7, d: 5.54, y: 0.55, tilt: 0.2, walls: 'EW' },
        { kind: 'tile', x: 0, z: -0.5, w: 7, d: 4, y: 1.1, walls: '' },
        { kind: 'tile', x: 0, z: -4.23, w: 7, d: 5.54, y: 0.55, tilt: -0.2, walls: 'EW' },
        { kind: 'tile', x: 1.6, z: -9.5, w: 10, d: 7, walls: '' },
        {
          kind: 'rail',
          points: [
            [-3.63, 6.13],
            [-3.63, 13.13],
            [3.63, 13.13],
            [3.63, 6.13],
          ],
        },
        // The crest has no ramp of its own to inherit walls from, so its flanks
        // need an explicit pair or the ball rolls off the top.
        { kind: 'rail', y: 1.1, points: [[-3.63, 1.6], [-3.63, -2.6]] },
        { kind: 'rail', y: 1.1, points: [[3.63, 1.6], [3.63, -2.6]] },
        {
          kind: 'rail',
          points: [
            [-3.63, -7],
            [-3.63, -13.13],
            [6.73, -13.13],
            [6.73, -7],
          ],
        },
        { kind: 'bump', x: 3.2, z: -9, radius: 2.4, height: -0.2 },

        { kind: 'prop', type: 'torii', x: 0, z: 20, scale: 1.05 },
        { kind: 'prop', type: 'pillar', x: -4.6, z: -0.5, y: 1.1 },
        { kind: 'prop', type: 'pillar', x: 4.6, z: -0.5, y: 1.1 },
        { kind: 'tree', type: 'pine', x: -6.9, z: -9, scale: 1.1 },
        { kind: 'tree', type: 'sakura', x: 10.1, z: -4, scale: 1.2 },
        { kind: 'scatter', type: 'grass', x: -6.9, z: 4, w: 4, d: 14, count: 100 },
        { kind: 'scatter', type: 'flowers', x: 8.1, z: 6, w: 4, d: 10, count: 36 },
      ],
    },

    // -- H5 . S-chicane: two reversing bends, no sightline ------------------
    {
      id: 'sakura-5',
      name: 'Bamboo Bend',
      par: 4,
      hint: 'Two turns, opposite ways. Take pace off before the second one.',
      tee: { x: -7, y: 0, z: 9 },
      cup: { x: 7, y: 0, z: -8 },
      pieces: [
        { kind: 'tile', x: -4, z: 9, w: 11, d: 6, walls: '' },
        { kind: 'tile', x: 1, z: 1, w: 5, d: 12, walls: '' },
        { kind: 'tile', x: 4, z: -7.5, w: 11, d: 7, walls: '' },
        // The rail traces the S itself. A bounding box round an S encloses two
        // large pockets of walled-in nothing, and a ball that reaches one drops
        // out of the world.
        {
          kind: 'rail',
          closed: true,
          points: [
            [-9.63, 12.13],
            [1.63, 12.13],
            [1.63, 7.13],
            [3.63, 7.13],
            [3.63, -3.87],
            [9.63, -3.87],
            [9.63, -11.13],
            [-1.63, -11.13],
            [-1.63, 5.87],
            [-9.63, 5.87],
          ],
        },
        { kind: 'bump', x: 7, z: -8, radius: 2.4, height: -0.2 },

        { kind: 'prop', type: 'bamboo', x: -1, z: 8 },
        { kind: 'prop', type: 'bamboo', x: 1.5, z: 9 },
        { kind: 'prop', type: 'lantern', x: 8.6, z: 3 },
        { kind: 'prop', type: 'chime', x: -10.6, z: 4, rotY: 0.4 },
        { kind: 'tree', type: 'sakura', x: -11.4, z: 8, scale: 1.15 },
        { kind: 'tree', type: 'pine', x: 9.4, z: -8, scale: 1.05 },
        { kind: 'scatter', type: 'grass', x: 0, z: 14.4, w: 12, d: 3, count: 90 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -15, w: 14, d: 3, count: 44 },
      ],
    },

    // -- H6 . Island green: reached only by a narrow causeway ---------------
    {
      id: 'sakura-6',
      name: 'Lantern Island',
      par: 3,
      hint: 'One way on and one way off. Miss the causeway and it costs you a stroke.',
      tee: { x: 0, y: 0, z: 11 },
      cup: { x: -3.6, y: 0, z: -7.5 },
      pieces: [
        { kind: 'tile', x: 0, z: 10, w: 8, d: 6, walls: '' },
        // The causeway is deliberately unrailed: missing it is the hazard.
        { kind: 'tile', x: 2.2, z: 2.5, w: 4.2, d: 12, walls: '', surface: 'wood', color: 0xc0693f },
        { kind: 'tile', x: -1.4, z: -7.5, w: 11, d: 9, walls: '' },
        { kind: 'water', x: -4, z: 3, w: 10, d: 10, y: -0.35 },
        {
          kind: 'rail',
          points: [
            [-4.13, 7.13],
            [-4.13, 13.13],
            [4.13, 13.13],
            [4.13, 7.13],
          ],
        },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-7.03, -2.87],
            [4.23, -2.87],
            [4.23, -12.13],
            [-7.03, -12.13],
          ],
        },
        { kind: 'bump', x: -3.6, z: -7.5, radius: 2.6, height: -0.24 },

        { kind: 'prop', type: 'lantern', x: -5.6, z: -4.4 },
        { kind: 'prop', type: 'lantern', x: 2.8, z: -4.4 },
        { kind: 'prop', type: 'koi', x: -5, z: 3, y: -0.42 },
        { kind: 'prop', type: 'koi', x: -7, z: 5, y: -0.42 },
        { kind: 'prop', type: 'rock', x: 6.4, z: 2, scale: 1.2 },
        { kind: 'tree', type: 'sakura', x: -9.4, z: 9, scale: 1.2 },
        { kind: 'tree', type: 'pine', x: 8.4, z: -9, scale: 1.05 },
        { kind: 'scatter', type: 'flowers', x: -1.4, z: -13.6, w: 11, d: 3, count: 42 },
      ],
    },

    // -- H7 . Ring: a walled island; go round either side -------------------
    {
      id: 'sakura-7',
      name: 'Moon Gate',
      par: 4,
      hint: 'Left or right, it is the same distance. Pick one and commit.',
      tee: { x: 0, y: 0, z: 10.5 },
      cup: { x: 0, y: 0, z: -10 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.5, w: 14, d: 6, walls: '' },
        { kind: 'tile', x: -5.5, z: 0, w: 3, d: 14, walls: '' },
        { kind: 'tile', x: 5.5, z: 0, w: 3, d: 14, walls: '' },
        { kind: 'tile', x: 0, z: -8.5, w: 14, d: 6, walls: '' },
        {
          kind: 'rail',
          closed: true,
          points: [
            [-7.13, 11.63],
            [7.13, 11.63],
            [7.13, -11.63],
            [-7.13, -11.63],
          ],
        },
        // The island in the middle. There is no floor inside it.
        {
          kind: 'rail',
          closed: true,
          points: [
            [-3.87, 5.37],
            [3.87, 5.37],
            [3.87, -5.37],
            [-3.87, -5.37],
          ],
        },
        { kind: 'bump', x: 0, z: -10, radius: 2.6, height: -0.24 },

        { kind: 'prop', type: 'torii', x: 0, z: 20, scale: 0.9 },
        { kind: 'prop', type: 'lantern', x: 0, z: 0 },
        { kind: 'prop', type: 'rock', x: -2, z: 2.5, scale: 1.1 },
        { kind: 'prop', type: 'rock', x: 2.2, z: -2, scale: 0.9 },
        { kind: 'tree', type: 'sakura', x: -9.6, z: 5, scale: 1.2 },
        { kind: 'tree', type: 'sakura', x: 9.8, z: -5, scale: 1.15 },
        { kind: 'scatter', type: 'grass', x: -9.6, z: -4, w: 4, d: 12, count: 90 },
        { kind: 'scatter', type: 'grass', x: 9.8, z: 4, w: 4, d: 12, count: 90 },
      ],
    },

    // -- H8 . Redan: long diagonal green with a kick slope and sand ---------
    {
      id: 'sakura-8',
      name: 'Raked Sand',
      par: 4,
      hint: 'The green runs away to the left. Use the slope, and stay out of the sand.',
      tee: { x: -6, y: 0, z: 11 },
      cup: { x: 5.5, y: 0, z: -9.5 },
      pieces: [
        { kind: 'tile', x: -6, z: 8.5, w: 6, d: 8, walls: '' },
        { kind: 'tile', x: -2, z: 1, w: 14, d: 8, walls: '' },
        // `roll` lifts the east edge, so a ball crossing the green is turned
        // back toward the pin instead of running off the far side.
        { kind: 'tile', x: 4, z: -7, w: 10, d: 9, roll: 0.1, walls: '' },
        // Raked sand guarding the direct line. Sand bleeds almost all the pace
        // out of a rolling ball, so the cost is a stroke, not a lost ball.
        { kind: 'tile', x: -1.5, z: -7, w: 5, d: 7, surface: 'sand', walls: '' },
        {
          kind: 'rail',
          points: [
            [-9.13, 12.63],
            [-2.87, 12.63],
            [-2.87, 5.13],
            [9.13, 5.13],
            [9.13, -11.63],
            [-4.13, -11.63],
            [-4.13, -3.13],
            [-9.13, -3.13],
            [-9.13, 12.63],
          ],
        },
        { kind: 'bump', x: 5.5, z: -9.5, radius: 2.4, height: -0.22 },

        { kind: 'prop', type: 'lantern', x: -10.4, z: 6 },
        { kind: 'prop', type: 'chime', x: 10.4, z: -6, rotY: -0.4 },
        { kind: 'prop', type: 'rock', x: -6.4, z: -6, scale: 1.2 },
        { kind: 'tree', type: 'sakura', x: -11, z: 9, scale: 1.25 },
        { kind: 'tree', type: 'pine', x: 11, z: -9, scale: 1.1 },
        { kind: 'scatter', type: 'grass', x: -11, z: 0, w: 4, d: 12, count: 90 },
        { kind: 'scatter', type: 'flowers', x: 2, z: -13.8, w: 12, d: 3, count: 44 },
      ],
    },
  ],
};

import type { CourseDef } from '../types';

/**
 * Course 2 — Sky Islands.
 *
 * The theme is *commitment*: every hole offers a fast line that risks the void
 * and a slower line that does not. Falling costs one stroke and returns the ball
 * to its last resting place, so aggression is priced rather than punished.
 *
 * Mechanics introduced: launch ramps (H4), timed obstacles and moving bridges
 * (H5), elevators and rotating platforms (H6).
 */
export const SKY_ISLANDS: CourseDef = {
  id: 'sky',
  name: 'Sky Islands',
  tagline: 'Mind the gap. There is a great deal of it.',
  theme: 'sky',
  requires: 'sakura',
  holes: [
    // ---------------------------------------------------------------- H4 ---
    {
      id: 'sky-1',
      name: 'First Flight',
      par: 3,
      hint: 'Full power up the ramp carries the gap. Short of that, take the plank on the right.',
      tee: { x: 0, y: 0, z: 10 },
      cup: { x: 0, y: 0.4, z: -9.5 },
      pieces: [
        // Launch island.
        { kind: 'tile', x: 0, z: 8, w: 7, d: 8, walls: 'SEW', thin: true },
        // The ramp: shallow enough to keep the ball on the deck, steep enough to
        // convert a full-power putt into a genuine carry.
        { kind: 'tile', x: 0, z: 1.97, w: 4.4, d: 4.46, y: 0.62, tilt: 0.24, walls: 'EW', thin: true },

        // Safe route — a narrow plank the player can putt across instead. A
        // gentle rise (0.2 -> 0.4) carries it up to the landing island's height.
        { kind: 'tile', x: 4.2, z: -0.25, w: 1.7, d: 9.9, y: 0.2, tilt: 0.0404, walls: '', surface: 'wood', color: 0xd8a25e, thin: true },

        // Landing island.
        { kind: 'tile', x: 0, z: -8.5, w: 9, d: 8, y: 0.4, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -9.5, y: 0.4, radius: 2.4, height: -0.18 },

        { kind: 'prop', type: 'balloon', x: -8.5, z: 4, y: 0, scale: 1.1 },
        { kind: 'prop', type: 'balloon', x: 9, z: -12, y: -1.5, scale: 0.9 },
        { kind: 'prop', type: 'rock', x: -4.2, z: 9.5, scale: 1.2 },
        { kind: 'prop', type: 'rock', x: 4.6, z: -12, y: 0.4, scale: 1.1 },

        { kind: 'tree', type: 'floating', x: -5.4, z: 6.5, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: 5.6, z: -9.5, y: 0.4, scale: 1.2 },
        { kind: 'tree', type: 'palm', x: -5.6, z: -10, y: 0.4, scale: 0.95 },

        { kind: 'scatter', type: 'grass', x: 0, z: 11.4, w: 7, d: 3, count: 90 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12, w: 9, d: 3, y: 0.4, count: 46 },
      ],
    },

    // ---------------------------------------------------------------- H5 ---
    {
      id: 'sky-2',
      name: 'Windmill Terrace',
      par: 4,
      hint: 'Read the blades before you commit. The ferry only waits for the patient.',
      tee: { x: 0, y: 0, z: 12 },
      cup: { x: 0, y: 0, z: -10.5 },
      pieces: [
        { kind: 'tile', x: 0, z: 10, w: 7, d: 7, walls: 'SEW', thin: true },

        // Timing gate: the blades sweep the full width of the corridor mouth.
        { kind: 'windmill', x: 0, z: 5.6, rotY: 0, speed: 1.05, blades: 4, scale: 1.15 },

        { kind: 'tile', x: 0, z: 1.45, w: 3.6, d: 11.5, walls: 'EW', thin: true },
        { kind: 'windmill', x: 0, z: -1.6, rotY: 0, speed: -1.45, blades: 3, scale: 0.95 },

        // Moving bridge across the void.
        { kind: 'mover', x: 0, z: -5, y: 0, w: 3.2, d: 2.8, axis: 'x', distance: 3.4, period: 4.2 },

        { kind: 'tile', x: 0, z: -10, w: 9, d: 7, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -10.5, radius: 2.3, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -9, z: 2, y: 1, scale: 1 },
        { kind: 'prop', type: 'balloon', x: 8.6, z: 8, y: -2, scale: 1.2 },
        { kind: 'prop', type: 'pillar', x: -3, z: 12.6 },
        { kind: 'prop', type: 'pillar', x: 3, z: 12.6 },
        { kind: 'prop', type: 'rock', x: -5.2, z: -12.5, scale: 1.3 },

        { kind: 'tree', type: 'floating', x: -5.6, z: 10.5, scale: 1.1 },
        { kind: 'tree', type: 'palm', x: 5.8, z: -11.5, scale: 1.1 },
        { kind: 'tree', type: 'floating', x: 5.4, z: 11, scale: 0.9 },

        { kind: 'scatter', type: 'grass', x: 0, z: 12.8, w: 7, d: 2.4, count: 80 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.4, w: 9, d: 2.6, count: 44 },
      ],
    },

    // ---------------------------------------------------------------- H6 ---
    {
      id: 'sky-3',
      name: 'Cloudbreak',
      par: 4,
      hint: 'Ride the lift, then let the carousel throw you at the pin. Fighting it wastes strokes.',
      tee: { x: 0, y: 0, z: 10.5 },
      cup: { x: 0, y: 2.6, z: -10.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 9, w: 6.5, d: 6.4, walls: 'SEW', thin: true },

        // The lift. Leaving its footprint empty when it is raised is the hazard.
        { kind: 'elevator', x: 0, z: 4.3, w: 3.8, d: 3.8, low: 0, high: 2.6, period: 5.5 },

        { kind: 'tile', x: 0, z: 0, w: 5.4, d: 5, y: 2.6, walls: 'W', thin: true },

        // Carousel: stepping on and letting it rotate is faster than putting
        // straight across, which the geometry does not actually allow.
        { kind: 'rotator', x: 0, z: -4.6, y: 2.6, radius: 2.5, speed: 0.85 },

        { kind: 'tile', x: 0, z: -10, w: 8, d: 6.2, y: 2.6, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -10.2, y: 2.6, radius: 2.2, height: -0.15 },

        // A consolation ledge below the carousel: overshooting drops the player
        // here instead of into the void, and a short ramp climbs back up.
        { kind: 'tile', x: 6.4, z: -4.6, w: 3.4, d: 4, y: 0.8, walls: 'NE', thin: true },
        // -0.6 rad was 2.5x the cap; a full-power ball off it rises 5.4u and leaves
        // the world. Depth solved from the rise it must span (0.8 -> 2.6, so 1.8):
        // d = 1.8/sin(0.24) = 7.57, centred at y = 1.7 so the low end meets the
        // ledge at 0.8 and the high end meets the deck at 2.6 exactly.
        { kind: 'tile', x: 6.4, z: -2.59, w: 3.4, d: 7.57, y: 1.7, tilt: -0.24, walls: 'EW', thin: true },
        // No N/S walls: this tile overlaps the upper deck, so walls on those edges
        // are not a boundary — they stand across open deck as an invisible barrier.
        { kind: 'tile', x: 3.95, z: 0, w: 3.9, d: 3.4, y: 2.6, walls: '', thin: true },

        { kind: 'prop', type: 'balloon', x: -8.8, z: -2, y: 2, scale: 1.15 },
        { kind: 'prop', type: 'balloon', x: 9.4, z: 7, y: -1, scale: 0.95 },
        { kind: 'prop', type: 'pillar', x: -3.6, z: -12.6, y: 2.6 },
        { kind: 'prop', type: 'pillar', x: 3.6, z: -12.6, y: 2.6 },
        { kind: 'prop', type: 'rock', x: -4.4, z: 10.5, scale: 1.2 },

        { kind: 'tree', type: 'floating', x: -5.2, z: 9, scale: 1 },
        { kind: 'tree', type: 'palm', x: -5.4, z: -11, y: 2.6, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: 5.6, z: -11.5, y: 2.6, scale: 1.15 },

        { kind: 'scatter', type: 'grass', x: 0, z: 11.8, w: 6.5, d: 2.2, count: 70 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.4, w: 8, d: 2.4, y: 2.6, count: 40 },
      ],
    },

    // ---------------------------------------------------------------- H7 ---
    {
      id: 'sky-4',
      name: 'Ridge Runner',
      par: 3,
      hint: 'The calm route is the safe route; take the line that stays on the ridge.',
      tee: { x: 0, y: 0, z: 10.2 },
      cup: { x: 0, y: 0.4, z: -9.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.2, w: 7.2, d: 7.6, walls: 'SEW', thin: true },
        { kind: 'tile', x: 0, z: 0.05, w: 4.6, d: 10.7, y: 0.3, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -8.25, w: 8.6, d: 7.3, y: 0.4, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -9.4, y: 0.4, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'balloon', x: -8.2, z: 3.8, y: 0.6, scale: 1.05 },
        { kind: 'prop', type: 'rock', x: 4.8, z: -11.8, y: 0.4, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: -5.6, z: 7.8, scale: 1 },
        { kind: 'tree', type: 'palm', x: 5.8, z: -10.4, y: 0.4, scale: 1.05 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.4, w: 8.8, d: 2.4, y: 0.4, count: 36 },
      ],
    },

    // ---------------------------------------------------------------- H8 ---
    {
      id: 'sky-5',
      name: 'Storm Ladder',
      par: 4,
      hint: 'Use the lift to gain height, then let the slope carry the ball toward the cup.',
      tee: { x: 0, y: 0, z: 10.8 },
      cup: { x: 0, y: 2.4, z: -10.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.8, w: 6.8, d: 7.2, walls: 'SEW', thin: true },
        { kind: 'elevator', x: 0, z: 4, w: 3.8, d: 3.8, low: 0, high: 2.4, period: 4.8 },
        { kind: 'tile', x: 0, z: -1.1, w: 5.4, d: 7.0, y: 2.4, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -7.9, w: 8.2, d: 8.0, y: 2.4, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -10.2, y: 2.4, radius: 2.2, height: -0.14 },
        { kind: 'prop', type: 'balloon', x: -8.6, z: -2.4, y: 2.2, scale: 1.1 },
        { kind: 'prop', type: 'pillar', x: -3.4, z: -12.6, y: 2.4 },
        { kind: 'prop', type: 'pillar', x: 3.4, z: -12.6, y: 2.4 },
        { kind: 'tree', type: 'floating', x: 5.8, z: 8.8, scale: 1.05 },
        { kind: 'scatter', type: 'grass', x: 0, z: 11.8, w: 7.2, d: 2.4, count: 70 },
      ],
    },

    // ---------------------------------------------------------------- H9 ---
    {
      id: 'sky-6',
      name: 'Gale Gate',
      par: 4,
      hint: 'Read the blades and spend a moment on the timing gate instead of forcing it.',
      tee: { x: 0, y: 0, z: 10.6 },
      cup: { x: -0.4, y: 0, z: -10.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.6, w: 6.8, d: 7.4, walls: 'SEW', thin: true },
        { kind: 'windmill', x: 0, z: 4.6, rotY: 0, speed: 1.2, blades: 4, scale: 1.1 },
        { kind: 'tile', x: 0, z: -0.175, w: 4.2, d: 9.75, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -8.225, w: 8.2, d: 7.75, walls: 'NEW', thin: true },
        { kind: 'bump', x: -0.4, z: -10.2, radius: 2.2, height: -0.15 },
        { kind: 'prop', type: 'pillar', x: -3.4, z: 11.4 },
        { kind: 'prop', type: 'pillar', x: 3.4, z: 11.4 },
        { kind: 'prop', type: 'rock', x: 4.8, z: -12.2, scale: 1.1 },
        { kind: 'tree', type: 'floating', x: 5.8, z: -10.2, scale: 1.1 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.8, w: 8.4, d: 2.4, count: 40 },
      ],
    },

    // ---------------------------------------------------------------- H10 ---
    {
      id: 'sky-7',
      name: 'Moonstep',
      par: 3,
      hint: 'The short bridge is the safe line; the wider platform is just a temptation.',
      tee: { x: 0, y: 0, z: 10.4 },
      cup: { x: 0.6, y: 0.4, z: -9.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.4, w: 6.6, d: 7.2, walls: 'SEW', thin: true },
        { kind: 'tile', x: 0, z: 0, w: 5.2, d: 11.0, y: 0.3, walls: 'EW', thin: true },
        { kind: 'tile', x: 4.25, z: 0, w: 3.3, d: 11.0, y: 0.3, walls: '', thin: true, surface: 'wood', color: 0xd8a25e },
        { kind: 'tile', x: 0, z: -8.4, w: 8.2, d: 7.2, y: 0.4, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0.6, z: -9.4, y: 0.4, radius: 2, height: -0.16 },
        { kind: 'prop', type: 'balloon', x: -8.6, z: 5.4, y: 0.8, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: -5.4, z: -9.4, y: 0.4, scale: 1.05 },
        { kind: 'tree', type: 'palm', x: 5.6, z: 7.6, scale: 0.98 },
      ],
    },

    // ---------------------------------------------------------------- H11 ---
    {
      id: 'sky-8',
      name: 'Arc Lift',
      par: 4,
      hint: 'The mover gives you a window; don’t chase the pin until the platform is in place.',
      tee: { x: 0, y: 0, z: 10.8 },
      cup: { x: 0, y: 0, z: -10.8 },
      pieces: [
        { kind: 'tile', x: 0, z: 7.25, w: 6.8, d: 10.7, walls: 'SEW', thin: true },
        { kind: 'mover', x: 0, z: 1.2, y: 0, w: 3.6, d: 2.8, axis: 'x', distance: 3.2, period: 3.8 },
        { kind: 'tile', x: 0, z: -3.65, w: 6, d: 8.3, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -10.8, w: 8.4, d: 6.6, walls: 'NEW', thin: true },
        { kind: 'bump', x: 0, z: -10.8, radius: 2.3, height: -0.16 },
        { kind: 'prop', type: 'balloon', x: 8.8, z: 0.8, y: -0.4, scale: 0.95 },
        { kind: 'prop', type: 'pillar', x: -3.6, z: 11.8 },
        { kind: 'prop', type: 'pillar', x: 3.6, z: 11.8 },
        { kind: 'tree', type: 'floating', x: -5.4, z: -11.2, scale: 1.05 },
      ],
    },
  ],
};

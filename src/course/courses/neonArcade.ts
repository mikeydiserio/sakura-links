import type { CourseDef } from '../types';

/**
 * Course 3 — Neon Arcade.
 *
 * The finale hands energy *back* to the player. Bumpers and boosters add speed
 * rather than removing it, so the skill being tested flips from "hit it hard
 * enough" to "control what the course gives you". Ice removes the rolling
 * friction the first two courses trained the player to rely on.
 */
export const NEON_ARCADE: CourseDef = {
  id: 'neon',
  name: 'Neon Arcade',
  tagline: 'Insert coin. Do not feed the bumpers.',
  theme: 'neon',
  requires: 'sky',
  holes: [
    // ---------------------------------------------------------------- H7 ---
    {
      id: 'neon-1',
      name: 'Insert Coin',
      par: 3,
      hint: 'The boost pad does the work. Aim, tap it gently, and let the bumpers sort it out.',
      tee: { x: 0, y: 0, z: 9.5 },
      cup: { x: 0, y: 0, z: -9 },
      pieces: [
        { kind: 'tile', x: 0, z: 0, w: 9, d: 23, walls: 'NSEW' },

        // Accelerator: a soft putt onto it becomes a full-power shot.
        { kind: 'booster', x: 0, z: 6.5, rotY: 0, w: 2.4, d: 2.6, power: 12 },

        { kind: 'bumper', x: -2.4, z: 2.4, radius: 0.5 },
        { kind: 'bumper', x: 2.4, z: 0.4, radius: 0.5 },
        { kind: 'bumper', x: -1.6, z: -3.6, radius: 0.42 },
        { kind: 'bumper', x: 3.1, z: -6.4, radius: 0.42 },

        { kind: 'bump', x: 0, z: -9, radius: 2.4, height: -0.16 },

        {
          kind: 'rail',
          points: [
            [-4.4, -11.4],
            [0, -13.2],
            [4.4, -11.4],
          ],
          glow: true,
          height: 0.5,
        },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.4, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -6, z: 4, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 6, z: -4, color: 0xff3ea5 },
        { kind: 'prop', type: 'pillar', x: -6.2, z: -9 },
        { kind: 'prop', type: 'pillar', x: 6.2, z: -9 },
        { kind: 'prop', type: 'rock', x: -6.4, z: 9, scale: 1.2, color: 0x3a2f66 },

        { kind: 'scatter', type: 'rocks', x: -8.4, z: 0, w: 4, d: 22, count: 16 },
        { kind: 'scatter', type: 'rocks', x: 8.4, z: 0, w: 4, d: 22, count: 16 },
      ],
    },

    // ---------------------------------------------------------------- H8 ---
    {
      id: 'neon-2',
      name: 'Circuit Break',
      par: 4,
      hint: 'Nothing slows down on the ice. Feather it through the gate and let the disc do the turning.',
      tee: { x: 0, y: 0, z: 12 },
      cup: { x: 0.8, y: 0, z: -12.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.6, w: 7, d: 8 , walls: 'SEW' },

        // Frictionless midsection guarded by a revolving gate.
        { kind: 'tile', x: 0, z: 0.2, w: 7, d: 8.8, surface: 'ice', color: 0x9fe8ff, walls: 'EW' },
        { kind: 'spinner', x: 0, z: 0.2, length: 3.4, speed: 1.55, arms: 2 },

        { kind: 'rotator', x: 0, z: -6.4, y: 0, radius: 2.7, speed: 1.05 },

        { kind: 'tile', x: 0, z: -12, w: 8, d: 5.4, walls: 'NEW' },
        { kind: 'bump', x: 0.8, z: -12.6, radius: 2.1, height: -0.15 },

        { kind: 'bumper', x: -2.6, z: -3.6, radius: 0.44 },
        { kind: 'bumper', x: 2.6, z: -3.6, radius: 0.44 },

        {
          kind: 'rail',
          points: [
            [-4.1, -4.2],
            [-4.1, -9.4],
          ],
          glow: true,
        },
        {
          kind: 'rail',
          points: [
            [4.1, -4.2],
            [4.1, -9.4],
          ],
          glow: true,
        },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.6, scale: 1 },
        { kind: 'prop', type: 'crystal', x: -6.4, z: 0.6, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 6.4, z: 0.6, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 0, z: -15.6, color: 0xff3ea5, scale: 1.3 },
        { kind: 'prop', type: 'pillar', x: -5.4, z: 8.6 },
        { kind: 'prop', type: 'pillar', x: 5.4, z: 8.6 },

        { kind: 'scatter', type: 'rocks', x: -8, z: -4, w: 4, d: 16, count: 12 },
        { kind: 'scatter', type: 'rocks', x: 8, z: -4, w: 4, d: 16, count: 12 },
      ],
    },

    // ---------------------------------------------------------------- H9 ---
    {
      id: 'neon-3',
      name: 'Grand Finale',
      par: 5,
      hint: 'Boost, thread the bumpers, catch the ferry, then send it up the ramp. No prizes for caution.',
      tee: { x: 0, y: 0, z: 13.5 },
      cup: { x: 0, y: 1.8, z: -13.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 12.4, w: 6.4, d: 6, walls: 'SEW' },
        { kind: 'booster', x: 0, z: 10.6, rotY: 0, w: 2.4, d: 2.4, power: 14 },

        // Bumper alley — narrow, so every contact matters.
        { kind: 'tile', x: 0, z: 5.2, w: 3.6, d: 8.6, walls: 'EW' },
        { kind: 'bumper', x: -0.95, z: 6.6, radius: 0.36 },
        { kind: 'bumper', x: 0.95, z: 3.4, radius: 0.36 },
        { kind: 'bumper', x: -0.9, z: 1.6, radius: 0.32 },

        // Ferry across the break.
        { kind: 'mover', x: 0, z: -0.6, y: 0, w: 3.2, d: 2.6, axis: 'x', distance: 3.4, period: 3.6 },

        { kind: 'tile', x: 0, z: -4.5, w: 6.4, d: 6.2, walls: 'EW' },
        { kind: 'jump', x: -2, z: -5, power: 10.5, radius: 0.62 },
        { kind: 'bumper', x: 2.2, z: -6, radius: 0.4 },

        // Final climb. The ramp's south lip is flush with the deck so a rolling
        // ball transitions onto it without catching.
        // 0.632 rad was 2.6x the 0.24 cap: a full-power ball (26 u/s) off that ramp
        // rises (26*sin0.632)^2/40 = 5.9u and leaves the course entirely. Depth is
        // solved from the rise instead of chosen — d = 1.8/sin(0.24) = 7.57, centred
        // at half the rise so the foot meets y=0 and the head meets y=1.8 exactly.
        { kind: 'tile', x: 0, z: -6.21, w: 4.4, d: 7.57, y: 0.9, tilt: 0.24, walls: 'EW' },

        { kind: 'tile', x: 0, z: -13, w: 8, d: 7, y: 1.8, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -13.4, y: 1.8, radius: 2.3, height: -0.17 },

        {
          kind: 'rail',
          points: [
            [-4.2, -9.6],
            [-4.2, -16.4],
            [4.2, -16.4],
            [4.2, -9.6],
          ],
          y: 1.8,
          glow: true,
          height: 0.42,
        },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 15.6, scale: 1.25 },
        { kind: 'prop', type: 'crystal', x: -5.4, z: 5, color: 0x2ff5e0, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: 5.4, z: 5, color: 0xff3ea5, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: 0, z: -17.4, y: 1.8, color: 0x2ff5e0, scale: 1.5 },
        { kind: 'prop', type: 'pillar', x: -5.2, z: -13, y: 1.8 },
        { kind: 'prop', type: 'pillar', x: 5.2, z: -13, y: 1.8 },
        { kind: 'prop', type: 'rock', x: -6, z: -0.6, scale: 1.3, color: 0x3a2f66 },
        { kind: 'prop', type: 'rock', x: 6, z: -0.6, scale: 1.1, color: 0x3a2f66 },

        { kind: 'scatter', type: 'rocks', x: -8.6, z: 2, w: 4, d: 20, count: 14 },
        { kind: 'scatter', type: 'rocks', x: 8.6, z: 2, w: 4, d: 20, count: 14 },
      ],
    },

    // ---------------------------------------------------------------- H10 ---
    {
      id: 'neon-4',
      name: 'Pixel Drift',
      par: 3,
      hint: 'Use the booster once and let the lane carry you clear of the bumpers.',
      tee: { x: 0, y: 0, z: 11.2 },
      cup: { x: 0, y: 0, z: -10.8 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6.8, d: 6.8, walls: 'SEW' },
        { kind: 'booster', x: 0, z: 7.2, w: 2.2, d: 2.2, power: 11.5 },
        { kind: 'tile', x: 0, z: 2.4, w: 4.6, d: 8.4, walls: 'EW' },
        { kind: 'bumper', x: -1.2, z: 3.6, radius: 0.4 },
        { kind: 'bumper', x: 1.2, z: 0.8, radius: 0.4 },
        { kind: 'tile', x: 0, z: -3.35, w: 4.6, d: 3.9, walls: 'EW' },
        { kind: 'tile', x: 0, z: -8.2, w: 7.4, d: 6.6, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -10.8, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.6, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -5.4, z: 2.8, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 5.4, z: -5.4, color: 0xff3ea5 },
        { kind: 'scatter', type: 'rocks', x: -8.6, z: 0, w: 3.8, d: 18, count: 12 },
      ],
    },

    // ---------------------------------------------------------------- H11 ---
    {
      id: 'neon-5',
      name: 'Voltage Loop',
      par: 4,
      hint: 'The spinner only helps if you approach it with speed and a calm line.',
      tee: { x: 0, y: 0, z: 11.4 },
      cup: { x: -0.8, y: 0, z: -10.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6.2, d: 6.8, walls: 'SEW' },
        { kind: 'tile', x: 0, z: 3.8, w: 4.6, d: 8.4, walls: 'EW' },
        { kind: 'spinner', x: 0, z: 3.8, length: 3.2, speed: 1.4, arms: 3 },
        { kind: 'bumper', x: -1.5, z: -0.4, radius: 0.4 },
        { kind: 'bumper', x: 1.5, z: -0.4, radius: 0.4 },
        { kind: 'tile', x: 0, z: -3.05, w: 4.6, d: 6.5, walls: 'EW' },
        { kind: 'tile', x: 0, z: -8.8, w: 7.2, d: 6.2, walls: 'NEW' },
        { kind: 'bump', x: -0.8, z: -10.6, radius: 2.1, height: -0.16 },
        { kind: 'prop', type: 'pillar', x: -5, z: 4.2 },
        { kind: 'prop', type: 'pillar', x: 5, z: 4.2 },
        { kind: 'prop', type: 'crystal', x: 0, z: -13.4, color: 0x2ff5e0, scale: 1.2 },
        { kind: 'scatter', type: 'rocks', x: 8.6, z: 0, w: 3.6, d: 18, count: 12 },
      ],
    },

    // ---------------------------------------------------------------- H12 ---
    {
      id: 'neon-6',
      name: 'Turbo Drift',
      par: 4,
      hint: 'The mover only needs a small push; the real challenge is keeping the line tidy.',
      tee: { x: 0, y: 0, z: 11.6 },
      cup: { x: 0, y: 0, z: -11.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6.4, d: 6.8, walls: 'SEW' },
        { kind: 'booster', x: 0, z: 6.4, w: 2.4, d: 2.4, power: 12.5 },
        { kind: 'tile', x: 0, z: 3.95, w: 4.8, d: 5.1, walls: 'EW' },
        { kind: 'mover', x: 0, z: 0.6, y: 0, w: 3.2, d: 2.6, axis: 'x', distance: 3.2, period: 3.4 },
        { kind: 'tile', x: 0, z: -4.6, w: 4.8, d: 8.2, walls: 'EW' },
        { kind: 'tile', x: 0, z: -10.8, w: 7.8, d: 6.8, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -11.2, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.8, scale: 1.05 },
        { kind: 'prop', type: 'crystal', x: -5.2, z: -1.8, color: 0xff3ea5 },
        { kind: 'prop', type: 'crystal', x: 5.2, z: -1.8, color: 0x2ff5e0 },
        { kind: 'scatter', type: 'rocks', x: -8.4, z: -2.8, w: 3.8, d: 16, count: 12 },
      ],
    },

    // ---------------------------------------------------------------- H13 ---
    {
      id: 'neon-7',
      name: 'Hyperlane',
      par: 5,
      hint: 'The jump pad is the shortcut; miss it and you are left to thread the lane.',
      tee: { x: 0, y: 0, z: 12.6 },
      cup: { x: 0, y: 0.8, z: -11.8 },
      pieces: [
        { kind: 'tile', x: 0, z: 10.2, w: 6.4, d: 6.8, walls: 'SEW' },
        { kind: 'jump', x: 0, z: 6.8, power: 11.2, radius: 0.64 },
        { kind: 'tile', x: 0, z: 2.2, w: 4.4, d: 8, walls: 'EW' },
        { kind: 'rotator', x: 0, z: -3.4, y: 0, radius: 2.3, speed: 0.95 },
        { kind: 'tile', x: 0, z: -6.9, w: 4.4, d: 3.4, y: 0.4, tilt: 0.24, walls: 'EW' },
        { kind: 'tile', x: 0, z: -9.2, w: 7.6, d: 6.8, y: 0.8, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -11.8, y: 0.8, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'pillar', x: -5.2, z: -2.6 },
        { kind: 'prop', type: 'pillar', x: 5.2, z: -2.6 },
        { kind: 'prop', type: 'crystal', x: 0, z: -15.2, color: 0xff3ea5, scale: 1.2 },
        { kind: 'scatter', type: 'rocks', x: -8.4, z: 0, w: 3.8, d: 20, count: 14 },
      ],
    },

    // ---------------------------------------------------------------- H14 ---
    {
      id: 'neon-8',
      name: 'Overclocked',
      par: 4,
      hint: 'The bumper lane is narrow, but the speed boost is worth the risk.',
      tee: { x: 0, y: 0, z: 11.4 },
      cup: { x: 0, y: 0, z: -10.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6.2, d: 6.8, walls: 'SEW' },
        { kind: 'booster', x: 0, z: 6.6, w: 2.2, d: 2.2, power: 13.2 },
        { kind: 'tile', x: 0, z: 2.4, w: 3.8, d: 8.4, walls: 'EW' },
        { kind: 'bumper', x: -0.95, z: 3.6, radius: 0.34 },
        { kind: 'bumper', x: 0.95, z: 1.2, radius: 0.34 },
        { kind: 'tile', x: 0, z: -3.65, w: 3.8, d: 4.7, walls: 'EW' },
        { kind: 'tile', x: 0, z: -8.8, w: 7.6, d: 6.6, walls: 'NEW' },
        { kind: 'bump', x: 0, z: -10.6, radius: 2.2, height: -0.16 },
        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.8, scale: 1.1 },
        { kind: 'prop', type: 'pillar', x: -5, z: -9.6 },
        { kind: 'prop', type: 'pillar', x: 5, z: -9.6 },
        { kind: 'scatter', type: 'rocks', x: 8.4, z: 0, w: 3.8, d: 18, count: 12 },
      ],
    },
  ],
};

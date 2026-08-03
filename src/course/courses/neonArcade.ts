import type { CourseDef } from '../types';

/**
 * Course 3 — Neon Arcade.
 *
 * The finale gives energy *back*. Bumpers and boosters add speed rather than
 * bleeding it, so the skill being tested flips from "hit it hard enough" to
 * "control what the course hands you". Ice removes the rolling friction the
 * first two courses trained the player to rely on.
 *
 * See `sakura.ts` for the tile/rail authoring conventions used here.
 */
export const NEON_ARCADE: CourseDef = {
  id: 'neon',
  name: 'Neon Arcade',
  tagline: 'Insert coin. Do not feed the bumpers.',
  theme: 'neon',
  requires: 'sky',
  holes: [
    // ── H1 · boost pad into a bumper field ──────────────────────────────────
    {
      id: 'neon-1',
      name: 'Insert Coin',
      par: 3,
      hint: 'The boost pad does the work. Tap it gently and let the bumpers sort it out.',
      tee: { x: 0, y: 0, z: 9.5 },
      cup: { x: 0, y: 0, z: -9 },
      pieces: [
        { kind: 'tile', x: 0, z: 0, w: 9, d: 23, walls: '' },
        {
          kind: 'rail',
          closed: true,
          glow: true,
          points: [
            [-4.63, -11.63],
            [4.63, -11.63],
            [4.63, 11.63],
            [-4.63, 11.63],
          ],
        },

        { kind: 'booster', x: 0, z: 6.5, rotY: 0, w: 2.4, d: 2.6, power: 12 },

        { kind: 'bumper', x: -2.4, z: 2.4, radius: 0.5 },
        { kind: 'bumper', x: 2.4, z: 0.4, radius: 0.5 },
        { kind: 'bumper', x: -1.6, z: -3.6, radius: 0.42 },
        { kind: 'bumper', x: 3.1, z: -6.4, radius: 0.42 },

        { kind: 'bump', x: 0, z: -9, radius: 2.4, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 14.4, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -6.4, z: 4, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 6.4, z: -4, color: 0xff3ea5 },
        { kind: 'prop', type: 'pillar', x: -6.6, z: -9 },
        { kind: 'prop', type: 'pillar', x: 6.6, z: -9 },

        { kind: 'scatter', type: 'rocks', x: -8.4, z: 0, w: 4, d: 22, count: 14 },
        { kind: 'scatter', type: 'rocks', x: 8.4, z: 0, w: 4, d: 22, count: 14 },
      ],
    },

    // ── H2 · frictionless midsection, revolving gate, carousel ──────────────
    {
      id: 'neon-2',
      name: 'Circuit Break',
      par: 4,
      hint: 'Nothing slows down on the ice. Feather it through the gate and let the disc turn you.',
      tee: { x: 0, y: 0, z: 12 },
      cup: { x: 0.6, y: 0, z: -12.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.6, w: 7, d: 8, walls: '' },
        { kind: 'tile', x: 0, z: 0.8, w: 7, d: 8.4, surface: 'ice', color: 0x9fe8ff, walls: '' },
        { kind: 'tile', x: 0, z: -4.4, w: 5.4, d: 2.6, walls: '' },
        { kind: 'rotator', x: 0, z: -7, y: 0, radius: 2.9, speed: 1.05 },
        { kind: 'tile', x: 0, z: -11.8, w: 8, d: 6, walls: '' },

        {
          kind: 'rail',
          glow: true,
          points: [
            [-3.63, 4.6],
            [-3.63, 12.73],
            [3.63, 12.73],
            [3.63, 4.6],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-3.63, 4.9],
            [-3.63, -3.1],
            [-2.83, -3.1],
            [-2.83, -4.4],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [3.63, 4.9],
            [3.63, -3.1],
            [2.83, -3.1],
            [2.83, -4.4],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-4.13, -8.6],
            [-4.13, -14.93],
            [4.13, -14.93],
            [4.13, -8.6],
          ],
        },

        { kind: 'spinner', x: 0, z: 0.8, length: 3.9, speed: 1.55, arms: 2 },
        { kind: 'bump', x: 0.6, z: -12.4, radius: 2.1, height: -0.15 },

        { kind: 'bumper', x: -2.4, z: -2, radius: 0.44 },
        { kind: 'bumper', x: 2.4, z: -2, radius: 0.44 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 14.6, scale: 1 },
        { kind: 'prop', type: 'crystal', x: -6.4, z: 0.8, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 6.4, z: 0.8, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 0, z: -16.6, color: 0xff3ea5, scale: 1.3 },
        { kind: 'prop', type: 'pillar', x: -5.4, z: 8.6 },
        { kind: 'prop', type: 'pillar', x: 5.4, z: 8.6 },

        { kind: 'scatter', type: 'rocks', x: -8, z: -4, w: 4, d: 16, count: 10 },
        { kind: 'scatter', type: 'rocks', x: 8, z: -4, w: 4, d: 16, count: 10 },
      ],
    },

    // ── H3 · booster lane, bumper slalom ────────────────────────────────────
    {
      id: 'neon-3',
      name: 'Pixel Drift',
      par: 3,
      hint: 'One boost is plenty. The slalom rewards a ball that is already moving straight.',
      tee: { x: 0, y: 0, z: 11.2 },
      cup: { x: 0, y: 0, z: -10.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6.8, d: 6.8, walls: '' },
        { kind: 'tile', x: 0, z: 1.4, w: 4.6, d: 10.4, walls: '' },
        { kind: 'tile', x: 0, z: -8.4, w: 7.4, d: 9.6, walls: '' },

        {
          kind: 'rail',
          closed: true,
          glow: true,
          points: [
            [-3.53, 12.93],
            [3.53, 12.93],
            [3.53, 6.33],
            [2.43, 6.33],
            [2.43, -3.53],
            [3.83, -3.53],
            [3.83, -13.33],
            [-3.83, -13.33],
            [-3.83, -3.53],
            [-2.43, -3.53],
            [-2.43, 6.33],
            [-3.53, 6.33],
          ],
        },

        { kind: 'booster', x: 0, z: 7.4, w: 2.2, d: 2.2, power: 11.5 },
        { kind: 'bumper', x: -1.2, z: 4.2, radius: 0.4 },
        { kind: 'bumper', x: 1.2, z: 1.4, radius: 0.4 },
        { kind: 'bumper', x: -1.2, z: -1.4, radius: 0.4 },
        { kind: 'bump', x: 0, z: -10.4, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 14.2, scale: 1 },
        { kind: 'prop', type: 'crystal', x: -5.6, z: 1.4, color: 0xff3ea5 },
        { kind: 'prop', type: 'crystal', x: 5.6, z: 1.4, color: 0x2ff5e0 },
        { kind: 'prop', type: 'pillar', x: -5.4, z: -8.4 },
        { kind: 'prop', type: 'pillar', x: 5.4, z: -8.4 },

        { kind: 'scatter', type: 'rocks', x: -7.4, z: 0, w: 3.6, d: 20, count: 12 },
        { kind: 'scatter', type: 'rocks', x: 7.4, z: 0, w: 3.6, d: 20, count: 12 },
      ],
    },

    // ── H4 · Principal's Nose: a hazard planted dead in the shot's line ──────
    // Real-world reference: the 16th at St Andrews — a mound with two flanking
    // bunkers ("nostrils") sitting centrally in the fairway, forcing a
    // left-or-right choice instead of a route around a walled-off shortcut.
    // This used to be a closed ring around a walled island (identical in
    // shape to Sakura's Lantern Loop); the fairway is now one continuous
    // sheet and the hazard sits on the direct line instead of enclosing one.
    {
      id: 'neon-4',
      name: 'Short Circuit',
      par: 3,
      hint: 'A mound sits square in the direct line. Pick a side and commit — the nostril bumpers punish a ball that tries to split the middle.',
      tee: { x: 0, y: 0, z: 10.2 },
      cup: { x: 0, y: 0, z: -9.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 8.8, w: 13, d: 5.6, walls: '' },
        { kind: 'tile', x: 0, z: 0.3, w: 13, d: 13.6, walls: '' },
        { kind: 'tile', x: 0, z: -8.2, w: 13, d: 5.6, walls: '' },

        {
          kind: 'rail',
          closed: true,
          glow: true,
          points: [
            [-6.63, 11.73],
            [6.63, 11.73],
            [6.63, -11.13],
            [-6.63, -11.13],
          ],
        },

        // The nose, and its two nostril bumpers.
        { kind: 'bump', x: 0, z: 3.4, radius: 2.3, height: 0.42 },
        { kind: 'bumper', x: -2.7, z: 3.2, radius: 0.42 },
        { kind: 'bumper', x: 2.7, z: 3.2, radius: 0.42 },

        { kind: 'bump', x: 0, z: -9.6, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 13.4, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -5.6, z: 4.4, color: 0x2ff5e0 },
        { kind: 'prop', type: 'crystal', x: 5.6, z: -3.4, color: 0xff3ea5 },
        { kind: 'prop', type: 'pillar', x: -8, z: 6 },
        { kind: 'prop', type: 'pillar', x: 8, z: -6 },

        { kind: 'scatter', type: 'rocks', x: 0, z: 3.4, w: 7, d: 3, count: 10 },
      ],
    },

    // ── H5 · long banked sweep on boosters ──────────────────────────────────
    {
      id: 'neon-5',
      name: 'Turbo Drift',
      par: 4,
      hint: 'A long right-hander. Ride the outside rail and let the second pad fire you home.',
      tee: { x: -4.6, y: 0, z: 10.6 },
      cup: { x: 5, y: 0, z: -9.6 },
      pieces: [
        { kind: 'tile', x: -4.6, z: 7.2, w: 5, d: 11.2, walls: '' },
        // The cross-band runs the full width of the L so the inside of the
        // corner is floored. An L built from two legs alone leaves the elbow
        // empty, and the ball drops straight through it.
        { kind: 'tile', x: 0.2, z: 0.6, w: 14.6, d: 5.2, walls: '' },
        { kind: 'tile', x: 5, z: -5.4, w: 5, d: 11.4, walls: '' },

        {
          kind: 'rail',
          closed: true,
          glow: true,
          points: [
            [-7.23, 12.93],
            [-2.07, 12.93],
            [-2.07, 3.23],
            [7.63, 3.23],
            [7.63, -11.23],
            [2.37, -11.23],
            [2.37, -1.97],
            [-7.23, -1.97],
          ],
        },

        { kind: 'booster', x: -4.6, z: 6, rotY: 0, w: 2.2, d: 2.2, power: 11 },
        { kind: 'booster', x: 5, z: -1.4, rotY: 0, w: 2.2, d: 2.2, power: 11.5 },
        { kind: 'bumper', x: -1.4, z: 0.6, radius: 0.46 },
        { kind: 'bumper', x: 2.4, z: 1.8, radius: 0.4 },
        { kind: 'bump', x: 5, z: -9.6, radius: 2, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: -4.6, z: 14.4, scale: 1 },
        { kind: 'prop', type: 'crystal', x: -5, z: -4, color: 0x2ff5e0, scale: 1.2 },
        { kind: 'prop', type: 'crystal', x: 9.4, z: 4, color: 0xff3ea5, scale: 1.1 },
        { kind: 'prop', type: 'pillar', x: -7.8, z: 2 },
        { kind: 'prop', type: 'pillar', x: 8.4, z: -9 },

        { kind: 'scatter', type: 'rocks', x: -5, z: -6, w: 5, d: 8, count: 8 },
      ],
    },

    // ── H6 · split lanes around a carousel hub ──────────────────────────────
    {
      id: 'neon-6',
      name: 'Hyperlane',
      par: 5,
      hint: 'Both lanes feed the carousel. Arrive slow and it places you; arrive fast and it flings you.',
      tee: { x: 0, y: 0, z: 13 },
      cup: { x: 0, y: 0, z: -12.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 11.4, w: 8.4, d: 5.6, walls: '' },
        // One continuous floor under both lanes and the island between them.
        // The inner rail makes the split; leaving the strip between the lanes
        // as void would drop the ball through the middle of the hole.
        { kind: 'tile', x: 0, z: 4.6, w: 10, d: 8.4, walls: '' },
        { kind: 'tile', x: 0, z: -0.4, w: 8.4, d: 3.4, walls: '' },
        { kind: 'rotator', x: 0, z: -4.2, y: 0, radius: 3, speed: 1.1 },
        { kind: 'tile', x: 0, z: -9.6, w: 4.6, d: 4.4, walls: '' },
        { kind: 'tile', x: 0, z: -12.6, w: 8, d: 5, walls: '' },

        // Open at the north: a closed loop here would wall the lanes off from
        // the carousel they are supposed to feed.
        {
          kind: 'rail',
          glow: true,
          points: [
            [-4.33, -2.23],
            [-4.33, 14.33],
            [4.33, 14.33],
            [4.33, -2.23],
          ],
        },
        {
          kind: 'rail',
          closed: true,
          glow: true,
          points: [
            [-1.37, 8.67],
            [1.37, 8.67],
            [1.37, 0.53],
            [-1.37, 0.53],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-2.43, -7.4],
            [-2.43, -15.23],
            [2.43, -15.23],
            [2.43, -7.4],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-4.13, -12.1],
            [-4.13, -15.23],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [4.13, -12.1],
            [4.13, -15.23],
          ],
        },

        { kind: 'booster', x: -3.2, z: 7.6, rotY: 0, w: 2, d: 2, power: 11 },
        { kind: 'bumper', x: 3.2, z: 6.2, radius: 0.38 },
        { kind: 'bumper', x: 3.2, z: 2.6, radius: 0.38 },
        { kind: 'bump', x: 0, z: -12.6, radius: 2.1, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 16.2, scale: 1.25 },
        { kind: 'prop', type: 'crystal', x: 0, z: 4.6, color: 0x2ff5e0, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -6.4, z: -4.2, color: 0xff3ea5, scale: 1.2 },
        { kind: 'prop', type: 'crystal', x: 6.4, z: -4.2, color: 0x2ff5e0, scale: 1.2 },
        { kind: 'prop', type: 'pillar', x: -5.8, z: 11.4 },
        { kind: 'prop', type: 'pillar', x: 5.8, z: 11.4 },

        { kind: 'scatter', type: 'rocks', x: -7.6, z: 0, w: 3.4, d: 20, count: 10 },
        { kind: 'scatter', type: 'rocks', x: 7.6, z: 0, w: 3.4, d: 20, count: 10 },
      ],
    },

    // ── H7 · ferry crossing over the grid ───────────────────────────────────
    {
      id: 'neon-7',
      name: 'Overclocked',
      par: 4,
      hint: 'The ferry runs east-west. Roll on, ride across, roll off — do not try to jump it.',
      tee: { x: 0, y: 0, z: 11 },
      cup: { x: 0, y: 0, z: -10.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.2, w: 7, d: 7, walls: '' },
        { kind: 'tile', x: 0, z: 4.4, w: 3.8, d: 3.4, walls: '' },
        // Ferry. It is longer than the gap and slides sideways *into* the gap,
        // so at one end of its travel the route is a continuous bridge and at
        // the other there is nothing. Docking at the aligned position — rather
        // than merely passing through it — is what makes the crossing a rhythm
        // to read instead of a coin flip.
        { kind: 'mover', x: 1.75, z: 0.5, y: 0, w: 3.4, d: 5, axis: 'x', distance: 1.75, period: 6 },
        { kind: 'tile', x: 0, z: -3.4, w: 3.8, d: 3.4, walls: '' },
        { kind: 'tile', x: 0, z: -8.6, w: 8, d: 8, walls: '' },

        {
          kind: 'rail',
          glow: true,
          points: [
            [-3.63, 5.6],
            [-3.63, 12.83],
            [3.63, 12.83],
            [3.63, 5.6],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-4.13, -4.7],
            [-4.13, -12.73],
            [4.13, -12.73],
            [4.13, -4.7],
          ],
        },

        { kind: 'bumper', x: -2.6, z: -6.4, radius: 0.42 },
        { kind: 'bumper', x: 2.6, z: -6.4, radius: 0.42 },
        { kind: 'bump', x: 0, z: -10.6, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 14, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: -6.6, z: 0.6, color: 0xff3ea5, scale: 1.3 },
        { kind: 'prop', type: 'crystal', x: 6.6, z: 0.6, color: 0xff3ea5, scale: 1.3 },
        { kind: 'prop', type: 'pillar', x: -5.6, z: 9.2 },
        { kind: 'prop', type: 'pillar', x: 5.6, z: 9.2 },

        { kind: 'scatter', type: 'rocks', x: 0, z: -14.4, w: 10, d: 3, count: 10 },
      ],
    },

    // ── H8 · the finale: boost, alley, jump pad, climb ──────────────────────
    {
      id: 'neon-8',
      name: 'Grand Finale',
      par: 5,
      hint: 'Boost, thread the alley, then send it up the ramp. No prizes for caution.',
      tee: { x: 0, y: 0, z: 13.5 },
      cup: { x: 0, y: 1.46, z: -13.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 12.4, w: 6.4, d: 6, walls: '' },
        { kind: 'tile', x: 0, z: 5.2, w: 3.6, d: 9, walls: '' },
        // Deck stops at z ≈ −4.7, where the ramp has come back down to deck
        // level. Overlapping further would leave the deck's side face standing
        // 0.4u proud across the ramp, which stops the ball dead.
        { kind: 'tile', x: 0, z: -1.8, w: 6.4, d: 5.8, walls: '' },
        // The climb. Long and shallow rather than short and steep: a 0.62 rad
        // ramp converts a full-power putt into 12 u/s of lift and throws the
        // ball clean out of the course, so the run is stretched instead.
        { kind: 'tile', x: 0, z: -7.6, w: 4.4, d: 6.2, y: 0.72, tilt: 0.24, walls: 'EW' },
        // Upper green starts where the ramp has already reached its height.
        { kind: 'tile', x: 0, z: -13.3, w: 8, d: 6, y: 1.46, walls: '' },

        {
          kind: 'rail',
          glow: true,
          points: [
            [-3.33, 9.23],
            [-3.33, 15.53],
            [3.33, 15.53],
            [3.33, 9.23],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [-1.93, 9.7],
            [-1.93, 1.1],
            [-3.33, 1.1],
            [-3.33, -5.9],
          ],
        },
        {
          kind: 'rail',
          glow: true,
          points: [
            [1.93, 9.7],
            [1.93, 1.1],
            [3.33, 1.1],
            [3.33, -5.9],
          ],
        },
        {
          kind: 'rail',
          y: 1.46,
          glow: true,
          points: [
            [-4.13, -8.3],
            [-4.13, -16.13],
            [4.13, -16.13],
            [4.13, -8.3],
          ],
        },

        { kind: 'booster', x: 0, z: 10.6, rotY: 0, w: 2.4, d: 2.4, power: 13 },
        { kind: 'bumper', x: -0.95, z: 6.6, radius: 0.36 },
        { kind: 'bumper', x: 0.95, z: 3.4, radius: 0.36 },
        { kind: 'bumper', x: -0.9, z: 1.4, radius: 0.32 },
        // A jump pad here threw the ball 2.3u into the air — clean over a 1.15u
        // rail and out of the course. Vertical launches only belong where
        // flying is the point; inside a railed corridor the pad becomes a
        // booster that keeps the ball on the deck.
        // Sited at the foot of the climb and strong enough to carry it: the
        // ramp needs 8.6 u/s just to reach the top, so a marginal pad turns the
        // finale into a series of failed run-ups.
        { kind: 'booster', x: 0, z: -3.8, rotY: 0, w: 2.6, d: 1.8, power: 14 },
        { kind: 'bumper', x: 2.4, z: -0.6, radius: 0.4 },
        { kind: 'bump', x: 0, z: -13.6, y: 1.46, radius: 2.3, height: -0.17 },

        { kind: 'prop', type: 'arcadeSign', x: 0, z: 17, scale: 1.3 },
        { kind: 'prop', type: 'crystal', x: -5.4, z: 5, color: 0x2ff5e0, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: 5.4, z: 5, color: 0xff3ea5, scale: 1.1 },
        { kind: 'prop', type: 'crystal', x: 0, z: -18, y: 1.46, color: 0x2ff5e0, scale: 1.6 },
        { kind: 'prop', type: 'pillar', x: -5.2, z: -12, y: 1.78 },
        { kind: 'prop', type: 'pillar', x: 5.2, z: -12, y: 1.78 },

        { kind: 'scatter', type: 'rocks', x: -7.6, z: 2, w: 3.4, d: 20, count: 12 },
        { kind: 'scatter', type: 'rocks', x: 7.6, z: 2, w: 3.4, d: 20, count: 12 },
      ],
    },
  ],
};

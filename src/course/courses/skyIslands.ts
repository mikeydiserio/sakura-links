import type { CourseDef } from '../types';

/**
 * Course 2 — Sky Islands.
 *
 * Height is the whole idea. Every hole is a thin deck suspended over nothing,
 * and the danger comes from the drop on either side of the route rather than
 * from gaps in the route itself.
 *
 * That distinction matters: a hole whose only line requires clearing a gap is
 * unfinishable the moment the physics disagrees with the designer. So the
 * connected path is always continuous, and the *fast* line is the one that
 * gambles — cutting a corner over the void, riding a ferry instead of walking
 * around, taking a ramp at full pace. Falling costs one stroke and returns the
 * ball to its last resting place, so ambition is priced, never punished twice.
 *
 * See `sakura.ts` for the tile/rail authoring conventions used here.
 */
export const SKY_ISLANDS: CourseDef = {
  id: 'sky',
  name: 'Sky Islands',
  tagline: 'Mind the gap. There is a great deal of it.',
  theme: 'sky',
  requires: 'sakura',
  holes: [
    // ── H1 · descending run from a high tee ─────────────────────────────────
    {
      id: 'sky-1',
      name: 'First Flight',
      par: 3,
      hint: 'Downhill all the way. The plank has no rails, so let gravity do the work.',
      tee: { x: 0, y: 2.4, z: 10 },
      cup: { x: 0, y: 0.8, z: -8 },
      pieces: [
        { kind: 'tile', x: 0, z: 10, w: 7, d: 8.4, y: 2.4, walls: '', thin: true },
        { kind: 'tile', x: 0, z: 4.8, w: 4.4, d: 3.2, y: 1.6, tilt: -0.5, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: 0.4, w: 2.6, d: 6.8, y: 0.8, walls: '', thin: true },
        { kind: 'tile', x: 0, z: -7.4, w: 9, d: 9.6, y: 0.8, walls: '', thin: true },

        {
          kind: 'rail',
          y: 2.4,
          points: [
            [-3.63, 6],
            [-3.63, 14.33],
            [3.63, 14.33],
            [3.63, 6],
          ],
        },
        {
          kind: 'rail',
          y: 0.8,
          points: [
            [-4.63, -2.8],
            [-4.63, -12.33],
            [4.63, -12.33],
            [4.63, -2.8],
          ],
        },

        { kind: 'bump', x: 0, z: -8, y: 0.8, radius: 2.3, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -8.5, z: 6, y: 1, scale: 1.1 },
        { kind: 'prop', type: 'balloon', x: 9, z: -10, y: -1.5, scale: 0.9 },
        { kind: 'prop', type: 'pillar', x: -4.6, z: 12.6, y: 2.4 },
        { kind: 'prop', type: 'pillar', x: 4.6, z: 12.6, y: 2.4 },

        { kind: 'tree', type: 'floating', x: -5.8, z: 10, y: 2.4, scale: 1.05 },
        { kind: 'tree', type: 'palm', x: -6, z: -9, y: 0.8, scale: 0.95 },
        { kind: 'tree', type: 'floating', x: 6, z: -8, y: 0.8, scale: 1.2 },

        // Kept clear of the camera lane behind the tee — see sakura-2.
        { kind: 'scatter', type: 'grass', x: -2.4, z: 13, w: 2.4, d: 2.4, y: 2.4, count: 35 },
        { kind: 'scatter', type: 'grass', x: 2.4, z: 13, w: 2.4, d: 2.4, y: 2.4, count: 35 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -11.4, w: 8.4, d: 2.4, y: 0.8, count: 40 },
      ],
    },

    // ── H2 · timing gate: two counter-rotating windmills ────────────────────
    {
      id: 'sky-2',
      name: 'Windmill Terrace',
      par: 4,
      hint: 'Read the blades before you commit. Both turn, and they do not agree.',
      tee: { x: 0, y: 0, z: 12 },
      cup: { x: 0, y: 0, z: -10.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 10, w: 7, d: 7.4, y: 0, walls: '', thin: true },
        { kind: 'tile', x: 0, z: 1.4, w: 3.6, d: 10.6, y: 0, walls: '', thin: true },
        { kind: 'tile', x: 0, z: -8.4, w: 9, d: 9.6, y: 0, walls: '', thin: true },

        {
          kind: 'rail',
          closed: true,
          points: [
            [-3.63, 13.83],
            [3.63, 13.83],
            [3.63, 6.43],
            [1.93, 6.43],
            [1.93, -3.73],
            [4.63, -3.73],
            [4.63, -13.33],
            [-4.63, -13.33],
            [-4.63, -3.73],
            [-1.93, -3.73],
            [-1.93, 6.43],
            [-3.63, 6.43],
          ],
        },

        { kind: 'windmill', x: 0, z: 5.2, rotY: 0, speed: 1.05, blades: 4, scale: 1.15 },
        { kind: 'windmill', x: 0, z: -1.6, rotY: 0, speed: -1.45, blades: 3, scale: 0.95 },

        { kind: 'bump', x: 0, z: -10.6, radius: 2.3, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -9, z: 2, y: 1, scale: 1 },
        { kind: 'prop', type: 'balloon', x: 8.6, z: 8, y: -2, scale: 1.2 },
        { kind: 'prop', type: 'pillar', x: -3, z: 13, },
        { kind: 'prop', type: 'pillar', x: 3, z: 13 },

        { kind: 'tree', type: 'floating', x: -6, z: 10.5, scale: 1.1 },
        { kind: 'tree', type: 'palm', x: 6.2, z: -11, scale: 1.1 },

        { kind: 'scatter', type: 'grass', x: 0, z: 12.8, w: 6.5, d: 2, count: 70 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.4, w: 8.4, d: 2, count: 40 },
      ],
    },

    // ── H3 · lift up, carousel across ───────────────────────────────────────
    {
      id: 'sky-3',
      name: 'Cloudbreak',
      par: 4,
      hint: 'Ride the lift, then let the carousel throw you at the pin. Fighting it wastes strokes.',
      tee: { x: 0, y: 0, z: 10.5 },
      cup: { x: 0, y: 2.6, z: -10.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 9, w: 6.5, d: 6.4, walls: '', thin: true },
        // The lift bridges 0 → 2.6. Its footprint overlaps both decks, so the
        // route is continuous even though the ride is timed.
        // Period 8, not 5.5. A quarter of the cycle now goes on gentle travel (see
        // DWELL_TRAVEL), which leaves ~2.1s parked at each end — enough to line up
        // and play a stroke off the platform rather than a scramble.
        { kind: 'elevator', x: 0, z: 4.4, w: 4.2, d: 4.6, low: 0, high: 2.6, period: 8 },
        { kind: 'tile', x: 0, z: -0.2, w: 5.4, d: 5.6, y: 2.6, walls: '', thin: true },
        { kind: 'rotator', x: 0, z: -4.6, y: 2.6, radius: 2.6, speed: 0.85 },
        { kind: 'tile', x: 0, z: -10, w: 8, d: 7, y: 2.6, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.38, 5.9],
            [-3.38, 12.33],
            [3.38, 12.33],
            [3.38, 5.9],
          ],
        },
        // Guide rails flanking the lift shaft, at both the bottom and the top.
        // Without them a ball that arrives even slightly off-centre simply
        // rolls off the side of the platform, which reads as the lift being
        // broken rather than as a mistake the player made.
        {
          kind: 'rail',
          points: [
            [-2.33, 6.8],
            [-2.33, 2.0],
          ],
        },
        {
          kind: 'rail',
          points: [
            [2.33, 6.8],
            [2.33, 2.0],
          ],
        },
        {
          kind: 'rail',
          y: 2.6,
          points: [
            [-2.83, 2.6],
            [-2.83, -1.9],
          ],
        },
        {
          kind: 'rail',
          y: 2.6,
          points: [
            [2.83, 2.6],
            [2.83, -1.9],
          ],
        },
        {
          kind: 'rail',
          y: 2.6,
          points: [
            [-4.13, -6.6],
            [-4.13, -13.63],
            [4.13, -13.63],
            [4.13, -6.6],
          ],
        },

        { kind: 'bump', x: 0, z: -10.4, y: 2.6, radius: 2.2, height: -0.15 },

        { kind: 'prop', type: 'balloon', x: -8.8, z: -2, y: 2, scale: 1.15 },
        { kind: 'prop', type: 'balloon', x: 9.4, z: 7, y: -1, scale: 0.95 },
        { kind: 'prop', type: 'pillar', x: -3.6, z: -13, y: 2.6 },
        { kind: 'prop', type: 'pillar', x: 3.6, z: -13, y: 2.6 },

        { kind: 'tree', type: 'floating', x: -5.4, z: 9, scale: 1 },
        { kind: 'tree', type: 'palm', x: -5.6, z: -11, y: 2.6, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: 5.8, z: -11.5, y: 2.6, scale: 1.15 },

        { kind: 'scatter', type: 'grass', x: 0, z: 11.6, w: 6, d: 2, count: 60 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -12.6, w: 7.4, d: 2, y: 2.6, count: 36 },
      ],
    },

    // ── H4 · staircase of plateaus ──────────────────────────────────────────
    {
      id: 'sky-4',
      name: 'Ridge Runner',
      par: 3,
      hint: 'Three steps up. Too much pace on the first ramp and you will fly the second.',
      tee: { x: 0, y: 0, z: 11 },
      cup: { x: 0, y: 1.2, z: -9.8 },
      pieces: [
        // Each deck stops where its ramp has already reached deck height, so no
        // deck side-face ever crosses a ramp. See the note in sakura-3.
        // Ramps are the full width of the decks they join. A narrower ramp
        // leaves an unwalled strip of deck either side of its mouth, and a ball
        // tracking the edge rolls straight off into the void.
        // Two gentle steps rather than two steep ones. The shelf between the
        // ramps is only 4.4u long, and rolling resistance bleeds roughly a
        // third of the ball's speed crossing it — with 0.85u climbs the ball
        // always arrived at the second ramp too slow to get up it, however well
        // the first was struck.
        { kind: 'tile', x: 0, z: 9.75, w: 6.6, d: 5.7, y: 0, walls: '', thin: true },
        { kind: 'tile', x: 0, z: 5.6, w: 6.6, d: 3, y: 0.3, tilt: 0.2, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: 2.2, w: 6.6, d: 4.4, y: 0.6, walls: '', thin: true },
        { kind: 'tile', x: 0, z: -1.4, w: 6.6, d: 3, y: 0.9, tilt: 0.2, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -6.8, w: 8, d: 8.4, y: 1.2, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.43, 7.0],
            [-3.43, 12.73],
            [3.43, 12.73],
            [3.43, 7.0],
          ],
        },
        {
          kind: 'rail',
          y: 0.6,
          points: [
            [-3.43, 4.5],
            [-3.43, -0.1],
          ],
        },
        {
          kind: 'rail',
          y: 0.6,
          points: [
            [3.43, 4.5],
            [3.43, -0.1],
          ],
        },
        {
          kind: 'rail',
          y: 1.2,
          points: [
            [-4.13, -2.9],
            [-4.13, -11.13],
            [4.13, -11.13],
            [4.13, -2.9],
          ],
        },

        { kind: 'bump', x: 0, z: -9.8, y: 1.2, radius: 2.1, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -8.2, z: 3.8, y: 1.6, scale: 1.05 },
        { kind: 'prop', type: 'pillar', x: -5, z: 9.4 },
        { kind: 'prop', type: 'pillar', x: 5, z: 9.4 },
        { kind: 'prop', type: 'rock', x: 5.2, z: -10.4, y: 1.2, scale: 1.05 },

        { kind: 'tree', type: 'floating', x: -5.8, z: 8.4, scale: 1 },
        { kind: 'tree', type: 'palm', x: 6, z: -6, y: 1.2, scale: 1.05 },

        { kind: 'scatter', type: 'flowers', x: 0, z: -10.4, w: 7.4, d: 2, y: 1.2, count: 34 },
        { kind: 'scatter', type: 'grass', x: 0, z: 12, w: 6, d: 2, count: 60 },
      ],
    },

    // ── H5 · single wide climb into a bumper shelf ──────────────────────────
    {
      id: 'sky-5',
      name: 'Storm Ladder',
      par: 4,
      hint: 'One long climb, then a shelf full of bumpers. Arrive slowly or they will keep you.',
      tee: { x: 0, y: 0, z: 11.4 },
      cup: { x: 0, y: 1.44, z: -7.6 },
      pieces: [
        // A single wide ramp rather than a switchback. Changing level and
        // direction at the same time asks the player to thread a narrow mouth
        // while still carrying the pace to climb it — two demands where the
        // hole only needs one.
        { kind: 'tile', x: 0, z: 8.6, w: 6.6, d: 8.8, y: 0, walls: '', thin: true },
        { kind: 'tile', x: 0, z: 2, w: 6.6, d: 6.1, y: 0.72, tilt: 0.24, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -5.4, w: 8, d: 9.4, y: 1.44, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.43, 4.2],
            [-3.43, 13.13],
            [3.43, 13.13],
            [3.43, 4.2],
          ],
        },
        {
          kind: 'rail',
          y: 1.44,
          points: [
            [-4.13, -0.6],
            [-4.13, -10.33],
            [4.13, -10.33],
            [4.13, -0.6],
          ],
        },

        // The shelf. Bumpers appear nowhere else on this course, which is what
        // stops the hole reading as a re-run of the earlier climbs.
        // y matters here: the shelf is at 1.44, and without it these three sat
        // at y = 0, a metre and a half underneath the deck they are meant to
        // defend. The hint promised a shelf full of bumpers and the hole had
        // none.
        { kind: 'bumper', x: -2.1, z: -3.2, y: 1.44, radius: 0.44 },
        { kind: 'bumper', x: 2.1, z: -3.2, y: 1.44, radius: 0.44 },
        { kind: 'bumper', x: 0, z: -5.6, y: 1.44, radius: 0.4 },
        { kind: 'bump', x: 0, z: -7.6, y: 1.44, radius: 2, height: -0.15 },

        { kind: 'prop', type: 'balloon', x: 8.8, z: 4, y: 1, scale: 1.1 },
        { kind: 'prop', type: 'balloon', x: -8.8, z: -6, y: 2.4, scale: 0.95 },
        { kind: 'prop', type: 'pillar', x: -5, z: 10.6 },
        { kind: 'prop', type: 'pillar', x: 5, z: 10.6 },
        { kind: 'prop', type: 'rock', x: -6, z: -8.6, y: 1.44, scale: 1 },

        { kind: 'tree', type: 'palm', x: 6.4, z: -8, y: 1.44, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: -6.4, z: 8, scale: 1.05 },

        { kind: 'scatter', type: 'grass', x: 0, z: 12.4, w: 6, d: 2, count: 60 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -9.4, w: 7.4, d: 1.8, y: 1.44, count: 30 },
      ],
    },
    // ── H6 · the Alps: a blind crest, then a gathering green beyond ─────────
    // Real-world reference: Prestwick's 17th — a rise blocks the view of the
    // green entirely, and the ball is committed the instant it goes over. This
    // used to be a straight lane with a single rotating gate (a spinner),
    // which was the same idea as H2's windmill terrace with the parts
    // swapped; the hole now gets its identity from elevation instead of from
    // a second timing obstacle.
    {
      id: 'sky-6',
      name: 'Blind Summit',
      par: 4,
      hint: 'The green is hidden behind the rise. Commit to the line over the crest and let the far slope carry you down.',
      tee: { x: 0, y: 0, z: 11.4 },
      cup: { x: 0, y: 0, z: -10.2 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.6, w: 7.4, d: 6.8, y: 0, walls: '', thin: true },
        // Climb: 0.219 rad keeps a healthy margin under the 0.24 rad cap the
        // rails can contain, while still covering a full metre of rise.
        { kind: 'tile', x: 0, z: 4.5, w: 7.4, d: 4.6, y: 0.5, tilt: 0.219, walls: 'EW', thin: true },
        // The crest. Flat and blind — nothing beyond it is visible from the
        // tee, which is the whole point of an Alps hole.
        { kind: 'tile', x: 0, z: 0.5, w: 7.4, d: 4.6, y: 1, walls: '', thin: true },
        // Descent, mirroring the climb back down to green level.
        { kind: 'tile', x: 0, z: -3.5, w: 7.4, d: 4.6, y: 0.5, tilt: -0.219, walls: 'EW', thin: true },
        { kind: 'tile', x: 0, z: -8.6, w: 8.4, d: 7, y: 0, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.83, 6.8],
            [-3.83, 13.13],
            [3.83, 13.13],
            [3.83, 6.8],
          ],
        },
        // Crest guide rails: the ridge has no ramp of its own to inherit
        // walls from, so its flanks need an explicit pair.
        {
          kind: 'rail',
          y: 1,
          points: [
            [-3.83, 2.8],
            [-3.83, -1.8],
          ],
        },
        {
          kind: 'rail',
          y: 1,
          points: [
            [3.83, 2.8],
            [3.83, -1.8],
          ],
        },
        {
          kind: 'rail',
          points: [
            [-4.33, -5.8],
            [-4.33, -12.23],
            [4.33, -12.23],
            [4.33, -5.8],
          ],
        },

        { kind: 'bump', x: 0, z: -10.2, radius: 2.2, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -8.6, z: 4, y: 1.4, scale: 1.1 },
        { kind: 'prop', type: 'balloon', x: 8.8, z: -6, y: -0.6, scale: 1 },
        { kind: 'prop', type: 'pillar', x: -5.2, z: 9.6 },
        { kind: 'prop', type: 'pillar', x: 5.2, z: 9.6 },

        { kind: 'tree', type: 'floating', x: -6.4, z: -2, y: 1, scale: 1.1 },
        { kind: 'tree', type: 'palm', x: 6.6, z: -9, scale: 1 },

        { kind: 'scatter', type: 'grass', x: 0, z: 12.4, w: 7, d: 2, count: 60 },
        { kind: 'scatter', type: 'flowers', x: 0, z: -11.4, w: 8, d: 2, count: 36 },
      ],
    },

    // ── H7 · stepping stones ────────────────────────────────────────────────
    {
      id: 'sky-7',
      name: 'Moonstep',
      par: 3,
      hint: 'A chain of small pads with nothing between them. Short, accurate taps.',
      tee: { x: 0, y: 0, z: 10.6 },
      cup: { x: 0, y: 0, z: -9.6 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.4, w: 6, d: 5.6, walls: '', thin: true },
        // Stepping pads. Each overlaps its neighbour on both axes — a diagonal
        // chain that merely touched at the corners would leave a strip of void
        // narrower than the ball, which reads as a bug rather than a challenge.
        { kind: 'tile', x: -1.6, z: 5.2, w: 3.8, d: 3.8, walls: '', thin: true },
        { kind: 'tile', x: 1.6, z: 2.4, w: 3.8, d: 3.8, walls: '', thin: true },
        { kind: 'tile', x: -1.6, z: -0.4, w: 3.8, d: 3.8, walls: '', thin: true },
        { kind: 'tile', x: 1.6, z: -3.2, w: 3.8, d: 3.8, walls: '', thin: true },
        { kind: 'tile', x: 0, z: -8.4, w: 7.4, d: 7.4, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.13, 6.6],
            [-3.13, 12.33],
            [3.13, 12.33],
            [3.13, 6.6],
          ],
        },
        {
          kind: 'rail',
          points: [
            [-3.83, -4.7],
            [-3.83, -12.23],
            [3.83, -12.23],
            [3.83, -4.7],
          ],
        },

        { kind: 'bump', x: 0, z: -9.6, radius: 2.1, height: -0.16 },

        { kind: 'prop', type: 'balloon', x: -7.6, z: 2, y: 1.2, scale: 1.05 },
        { kind: 'prop', type: 'balloon', x: 7.8, z: -2, y: -0.8, scale: 1.15 },
        { kind: 'prop', type: 'pillar', x: -4.6, z: 9.4 },
        { kind: 'prop', type: 'pillar', x: 4.6, z: 9.4 },

        { kind: 'tree', type: 'floating', x: -5.6, z: -8, scale: 1.1 },
        { kind: 'tree', type: 'palm', x: 5.8, z: -9, scale: 1 },

        { kind: 'scatter', type: 'flowers', x: 0, z: -11.4, w: 7, d: 2, count: 32 },
      ],
    },

    // ── H8 · double lift, curved upper deck ─────────────────────────────────
    {
      id: 'sky-8',
      name: 'Arc Lift',
      par: 4,
      hint: 'One lift, and it waits at the bottom. Ride it up, then swing west to the pin.',
      tee: { x: 0, y: 0, z: 11.2 },
      cup: { x: -6.4, y: 2.6, z: -7.4 },
      pieces: [
        { kind: 'tile', x: 0, z: 9.6, w: 6.6, d: 6.4, walls: '', thin: true },
        // One tall lift rather than two stacked. Chaining lifts meant a
        // mistimed approach to the second dropped the ball all the way to the
        // void, with no chance to retry from the deck it had just earned.
        { kind: 'elevator', x: 0, z: 5, w: 5, d: 5.2, low: 0, high: 2.6, period: 7.5 },
        { kind: 'tile', x: 0, z: 0.6, w: 6, d: 5.2, y: 2.6, walls: '', thin: true },
        // Upper deck curls west to the pin.
        { kind: 'tile', x: -3.4, z: -3.2, w: 12.8, d: 4.6, y: 2.6, walls: '', thin: true },
        { kind: 'tile', x: -6.4, z: -7.2, w: 6.8, d: 4.6, y: 2.6, walls: '', thin: true },

        {
          kind: 'rail',
          points: [
            [-3.43, 6.6],
            [-3.43, 12.93],
            [3.43, 12.93],
            [3.43, 6.6],
          ],
        },
        // Shaft guides — see the note on Cloudbreak.
        {
          kind: 'rail',
          points: [
            [-2.73, 7.4],
            [-2.73, 2.6],
          ],
        },
        {
          kind: 'rail',
          points: [
            [2.73, 7.4],
            [2.73, 2.6],
          ],
        },
        // Upper level: a single closed boundary around the L-shaped deck.
        {
          kind: 'rail',
          y: 2.6,
          closed: true,
          points: [
            [-3.13, 3.33],
            [3.13, 3.33],
            [3.13, -0.77],
            [3.13, -5.63],
            [-3.03, -5.63],
            [-3.03, -9.63],
            [-9.93, -9.63],
            [-9.93, -0.77],
            [-3.13, -0.77],
          ],
        },

        { kind: 'bump', x: -6.4, z: -7.4, y: 2.6, radius: 1.9, height: -0.15 },

        { kind: 'prop', type: 'balloon', x: 8.4, z: 0, y: 2.4, scale: 1.15 },
        { kind: 'prop', type: 'balloon', x: -8.6, z: 6, y: 0.6, scale: 0.95 },
        { kind: 'prop', type: 'pillar', x: -4.8, z: 9.6 },
        { kind: 'prop', type: 'pillar', x: 4.8, z: 9.6 },
        { kind: 'prop', type: 'rock', x: 0.4, z: -8.4, y: 2.6, scale: 0.9 },

        { kind: 'tree', type: 'palm', x: -10.8, z: -7.4, y: 2.6, scale: 1.05 },
        { kind: 'tree', type: 'floating', x: 5, z: -3.2, y: 2.6, scale: 1.1 },

        { kind: 'scatter', type: 'flowers', x: -6.4, z: -8.8, w: 5.4, d: 1.6, y: 2.6, count: 28 },
        { kind: 'scatter', type: 'grass', x: 0, z: 12, w: 6, d: 2, count: 55 },
      ],
    },
  ],
};

import { COURSES } from '../course';
import type { CourseDef, HoleDef, Piece } from '../course/types';

/**
 * Static layout validation.
 *
 * The playtest bot proves a hole *can* be finished, but when it cannot it only
 * reports the symptom. This checks the geometry directly and names the cause:
 * a ball can only travel across surfaces that touch, so a hole whose playable
 * area is split into disconnected islands is unfinishable no matter how well
 * it is struck.
 *
 * The model is deliberately conservative — it works on axis-aligned footprints
 * and edge heights, ignoring rotation. A false positive costs a second of
 * checking; a false negative ships a hole nobody can complete.
 */

/** A rectangular patch of standable surface, in world XZ with edge heights. */
interface Footprint {
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Surface height at the north (−Z) and south (+Z) edges. */
  northY: number;
  southY: number;
  /** Lowest and highest point of the patch — movers sweep, so these differ. */
  minY: number;
  maxY: number;
  /** Pads can fling a ball across a gap the geometry does not bridge. */
  launcher: boolean;
}

export interface LayoutIssue {
  courseId: string;
  holeId: string;
  holeName: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Tiles must overlap or nearly touch to be walkable between. */
const GAP_TOLERANCE = 0.3;
/** Height step a rolling ball can climb without a ramp. */
const STEP_TOLERANCE = 0.32;

function footprintsFor(piece: Piece): Footprint[] {
  switch (piece.kind) {
    case 'tile': {
      const { x, z, w, d, y = 0, tilt = 0, roll = 0, rotY = 0 } = piece;
      // A rotated tile's AABB is its bounding box; using the larger extent is
      // the conservative choice for a connectivity test.
      const halfW = (Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d) / 2;
      const halfD = (Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d) / 2;

      // Positive tilt lifts the north edge; positive roll lifts the east edge.
      // A ramp's usable heights are therefore its edges, not its centre, and a
      // roll-ramp joins its neighbours east-west rather than north-south.
      const tiltRise = (Math.sin(tilt) * d) / 2;
      const rollRise = (Math.sin(roll) * w) / 2;
      const northY = y + tiltRise;
      const southY = y - tiltRise;
      const eastY = y + rollRise;
      const westY = y - rollRise;

      return [
        {
          label: `tile(${x},${z})`,
          minX: x - halfW,
          maxX: x + halfW,
          minZ: z - halfD,
          maxZ: z + halfD,
          northY,
          southY,
          minY: Math.min(northY, southY, westY, eastY),
          maxY: Math.max(northY, southY, westY, eastY),
          launcher: false,
        },
      ];
    }

    case 'elevator': {
      const { x, z, w, d, low, high } = piece;
      return [
        {
          label: `elevator(${x},${z})`,
          minX: x - w / 2,
          maxX: x + w / 2,
          minZ: z - d / 2,
          maxZ: z + d / 2,
          northY: high,
          southY: low,
          minY: low,
          maxY: high,
          launcher: false,
        },
      ];
    }

    case 'mover': {
      const { x, z, w, d, y, axis, distance } = piece;
      // The swept footprint: a mover bridges anything its travel reaches.
      const sweepX = axis === 'x' ? distance : 0;
      const sweepZ = axis === 'z' ? distance : 0;
      return [
        {
          label: `mover(${x},${z})`,
          minX: x - w / 2 - sweepX,
          maxX: x + w / 2 + sweepX,
          minZ: z - d / 2 - sweepZ,
          maxZ: z + d / 2 + sweepZ,
          northY: y,
          southY: y,
          minY: y,
          maxY: y,
          launcher: false,
        },
      ];
    }

    case 'rotator': {
      const { x, z, y, radius } = piece;
      return [
        {
          label: `rotator(${x},${z})`,
          minX: x - radius,
          maxX: x + radius,
          minZ: z - radius,
          maxZ: z + radius,
          northY: y,
          southY: y,
          minY: y,
          maxY: y,
          launcher: false,
        },
      ];
    }

    case 'jump':
    case 'booster': {
      const x = piece.x;
      const z = piece.z;
      const y = piece.y ?? 0;
      const half = piece.kind === 'jump' ? (piece.radius ?? 0.7) : Math.max(piece.w ?? 1.4, piece.d ?? 2.2) / 2;
      return [
        {
          label: `${piece.kind}(${x},${z})`,
          minX: x - half,
          maxX: x + half,
          minZ: z - half,
          maxZ: z + half,
          northY: y,
          southY: y,
          minY: y,
          maxY: y,
          launcher: true,
        },
      ];
    }

    default:
      return [];
  }
}

/** True when a ball could roll (or be carried) from `a` to `b`. */
function connected(a: Footprint, b: Footprint): boolean {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);

  // Must share a real edge on one axis and touch on the other.
  const touching =
    (overlapX > 0.15 && overlapZ > -GAP_TOLERANCE) || (overlapZ > 0.15 && overlapX > -GAP_TOLERANCE);
  if (!touching) return false;

  // A launcher is allowed to throw the ball onto anything nearby and above.
  if (a.launcher || b.launcher) return true;

  // Heights must meet somewhere. Ramps make this generous: compare every edge
  // height of one patch against every edge height of the other.
  const aHeights = [a.northY, a.southY, a.minY, a.maxY];
  const bHeights = [b.northY, b.southY, b.minY, b.maxY];
  for (const ay of aHeights) {
    for (const by of bHeights) {
      if (Math.abs(ay - by) <= STEP_TOLERANCE) return true;
    }
  }
  return false;
}

function pointOn(footprints: Footprint[], x: number, z: number, y: number): number {
  // Index of the patch under a point, or -1. Generous on the vertical so a tee
  // sitting a ball-radius above its tile still resolves.
  let best = -1;
  let bestDelta = Infinity;
  footprints.forEach((f, index) => {
    if (x < f.minX - 0.2 || x > f.maxX + 0.2 || z < f.minZ - 0.2 || z > f.maxZ + 0.2) return;
    const delta = Math.min(Math.abs(y - f.minY), Math.abs(y - f.maxY));
    if (delta < bestDelta && delta < 1.2) {
      bestDelta = delta;
      best = index;
    }
  });
  return best;
}

/** Squared distance from a point to a line segment, in XZ. */
function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Even-odd point-in-polygon over a rail's XZ points. */
function insidePolygon(points: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Every point a rail encloses must have floor under it.
 *
 * This is the failure that cost the most debugging time: an L-shaped hole whose
 * rails correctly traced the outline, but whose floor tiles left the inside of
 * the corner empty. The boundary looked right from every camera angle, and the
 * ball simply dropped through a 3×3 patch of nothing. Sampling the enclosed
 * area is the only way to catch it without playing every square metre by hand.
 *
 * Ring-shaped holes are handled by the even-odd rule: a point inside both the
 * outer boundary and an inner island counts as outside, and needs no floor.
 */
function checkFloorCoverage(hole: HoleDef, surfaces: Footprint[]): string[] {
  // Water is *meant* to have no floor — it is a hazard, not a fall-through — so
  // it counts as covered here even though it never counts as connected.
  const footprints: Footprint[] = [
    ...surfaces,
    ...hole.pieces
      .filter((p): p is Extract<Piece, { kind: 'water' }> => p.kind === 'water')
      .map((p) => ({
        label: `water(${p.x},${p.z})`,
        minX: p.x - p.w / 2,
        maxX: p.x + p.w / 2,
        minZ: p.z - p.d / 2,
        maxZ: p.z + p.d / 2,
        northY: p.y ?? 0,
        southY: p.y ?? 0,
        minY: p.y ?? 0,
        maxY: p.y ?? 0,
        launcher: false,
      })),
  ];

  const closed = hole.pieces.filter(
    (p): p is Extract<Piece, { kind: 'rail' }> => p.kind === 'rail' && p.closed === true,
  );
  if (closed.length === 0) return [];

  const problems: string[] = [];
  const STEP = 0.5;

  // Group rails by height so a two-storey hole does not test one level's
  // boundary against the other's floor.
  const levels = new Map<number, Array<Extract<Piece, { kind: 'rail' }>>>();
  for (const rail of closed) {
    const y = Math.round((rail.y ?? 0) * 4) / 4;
    const list = levels.get(y) ?? [];
    list.push(rail);
    levels.set(y, list);
  }

  for (const [y, rails] of levels) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const rail of rails) {
      for (const [px, pz] of rail.points) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minZ = Math.min(minZ, pz);
        maxZ = Math.max(maxZ, pz);
      }
    }

    let uncovered = 0;
    let sample: [number, number] | null = null;

    for (let x = minX + STEP / 2; x < maxX; x += STEP) {
      for (let z = minZ + STEP / 2; z < maxZ; z += STEP) {
        let crossings = 0;
        for (const rail of rails) if (insidePolygon(rail.points, x, z)) crossings++;
        if (crossings % 2 === 0) continue; // outside, or inside an island

        const covered = footprints.some(
          (f) =>
            x >= f.minX - 0.05 &&
            x <= f.maxX + 0.05 &&
            z >= f.minZ - 0.05 &&
            z <= f.maxZ + 0.05 &&
            Math.abs(f.minY - y) < 1.6,
        );

        // A rail is a solid box straddling its own centre-line, so the thin
        // strip between a tile edge and the line outside it is filled by the
        // rail itself. Ignoring that band keeps the report to real holes.
        if (!covered) {
          const nearRail = rails.some((rail) => {
            const points = rail.points;
            for (let i = 0; i < points.length; i++) {
              const a = points[i];
              const b = points[(i + 1) % points.length];
              if (distanceToSegment(x, z, a[0], a[1], b[0], b[1]) < 0.45) return true;
            }
            return false;
          });
          if (nearRail) continue;
        }

        if (!covered) {
          uncovered++;
          if (!sample) sample = [x, z];
        }
      }
    }

    if (uncovered > 0 && sample) {
      problems.push(
        `${(uncovered * STEP * STEP).toFixed(1)}u² of rail-enclosed area at y=${y} has no floor ` +
          `(e.g. x ${sample[0].toFixed(1)}, z ${sample[1].toFixed(1)})`,
      );
    }
  }

  return problems;
}

export function validateHole(course: CourseDef, hole: HoleDef): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const add = (severity: 'error' | 'warning', message: string): void => {
    issues.push({ courseId: course.id, holeId: hole.id, holeName: hole.name, severity, message });
  };

  const footprints = hole.pieces.flatMap(footprintsFor);
  if (footprints.length === 0) {
    add('error', 'hole has no playable surface');
    return issues;
  }

  const teeIndex = pointOn(footprints, hole.tee.x, hole.tee.z, hole.tee.y);
  const cupIndex = pointOn(footprints, hole.cup.x, hole.cup.z, hole.cup.y);

  if (teeIndex < 0) add('error', `tee at (${hole.tee.x}, ${hole.tee.z}) is not over any surface`);
  if (cupIndex < 0) add('error', `cup at (${hole.cup.x}, ${hole.cup.z}) is not over any surface`);
  if (teeIndex < 0 || cupIndex < 0) return issues;

  // Flood fill from the tee across connected patches.
  const reached = new Set<number>([teeIndex]);
  const queue = [teeIndex];
  while (queue.length > 0) {
    const current = queue.pop() as number;
    for (let i = 0; i < footprints.length; i++) {
      if (reached.has(i)) continue;
      if (connected(footprints[current], footprints[i])) {
        reached.add(i);
        queue.push(i);
      }
    }
  }

  if (!reached.has(cupIndex)) {
    // Name the nearest unreached patch to the reachable set — that is almost
    // always the gap the author needs to close.
    let nearest = Infinity;
    let culprit = '';
    for (const r of reached) {
      const a = footprints[r];
      for (let i = 0; i < footprints.length; i++) {
        if (reached.has(i)) continue;
        const b = footprints[i];
        const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
        const gapZ = Math.max(0, Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ));
        const gap = Math.hypot(gapX, gapZ);
        if (gap < nearest) {
          nearest = gap;
          culprit = `${a.label} → ${b.label} (gap ${gap.toFixed(2)}u)`;
        }
      }
    }
    add('error', `cup is unreachable from the tee — closest break: ${culprit}`);
  }

  const orphans = footprints.length - reached.size;
  if (orphans > 0 && reached.has(cupIndex)) {
    add('warning', `${orphans} surface patch(es) are disconnected from the main route`);
  }

  for (const problem of checkFloorCoverage(hole, footprints)) add('error', problem);

  // Gameplay furniture must stand on a floor.
  //
  // `y` defaults to 0, which is right for the many holes that are entirely at
  // ground level and quietly wrong the moment a hole has a raised deck. Storm
  // Ladder shipped with three bumpers sitting a metre and a half below the shelf
  // they were meant to defend: invisible, inert, and impossible to spot by
  // reading the hole file, because the bug is the *absence* of a property.
  for (const piece of hole.pieces) {
    if (piece.kind !== 'bumper' && piece.kind !== 'spinner' && piece.kind !== 'windmill') {
      continue;
    }
    const py = (piece as { y?: number }).y ?? 0;
    const px = (piece as { x: number }).x;
    const pz = (piece as { z: number }).z;
    const floor = footprints.find(
      (f) => px >= f.minX && px <= f.maxX && pz >= f.minZ && pz <= f.maxZ,
    );
    if (!floor) {
      add('warning', `${piece.kind}(${px},${pz}) stands over no floor at all`);
    } else if (py < floor.minY - 0.3 || py > floor.maxY + 0.3) {
      add(
        'error',
        `${piece.kind}(${px},${pz}) sits at y=${py} but the floor beneath it is at ` +
          `y=${floor.minY.toFixed(2)}..${floor.maxY.toFixed(2)} — missing an explicit y?`,
      );
    }
  }

  return issues;
}

export function validateAll(): LayoutIssue[] {
  return COURSES.flatMap((course) => course.holes.flatMap((hole) => validateHole(course, hole)));
}

export function formatIssues(issues: LayoutIssue[]): string {
  if (issues.length === 0) return 'Layout OK — every cup is reachable from its tee.';
  return issues
    .map((i) => `[${i.severity === 'error' ? 'ERR ' : 'warn'}] ${i.courseId}/${i.holeId} ${i.holeName}: ${i.message}`)
    .join('\n');
}

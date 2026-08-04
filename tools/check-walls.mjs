/**
 * Finds per-tile `walls` that stand in the middle of another tile's surface.
 *
 *   node tools/check-walls.mjs          # report
 *   node tools/check-walls.mjs --fix    # strip the offending letters
 *
 * Floors are built from overlapping tiles, and each tile can carry its own
 * perimeter walls via letters in `walls` (N = -Z, S = +Z, E = +X, W = -X). Those
 * two facts fight each other: the moment tile A is grown to overlap neighbour B,
 * any wall on the shared edge stops being a boundary and becomes an invisible
 * barrier standing across open fairway.
 *
 * It is an unusually nasty bug because every *static* check still passes — the
 * floors are continuous, the cup is reachable on paper — and the ball simply
 * refuses to travel, or worse, ends up wedged inside the wall and jitters
 * upward as the solver pushes it out. That is exactly what happened after a
 * batch of connectivity repairs enlarged tiles without clearing the walls they
 * grew past.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WALL_THICKNESS = 0.26;
const STEP_TOLERANCE = 0.32;
const FILES = ['sakura', 'skyIslands', 'neonArcade'];
const FIX = process.argv.includes('--fix');

const num = (src, key, fallback) => {
  const m = new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`).exec(src);
  return m ? Number(m[1]) : fallback;
};

/** Parses every tile in a hole, keeping the raw source so we can rewrite it. */
function tilesOf(chunk) {
  const out = [];
  const re = /\{\s*kind:\s*'tile'([^{}]*)\}/g;
  let m;
  while ((m = re.exec(chunk))) {
    const body = m[1];
    const x = num(body, 'x', 0), z = num(body, 'z', 0);
    const w = num(body, 'w', 0), d = num(body, 'd', 0);
    const y = num(body, 'y', 0);
    const tilt = num(body, 'tilt', 0);
    const walls = /walls:\s*'([NSEW]*)'/.exec(body)?.[1] ?? 'NSEW';
    const tiltRise = (Math.sin(tilt) * d) / 2;
    out.push({
      raw: m[0], body, x, z, w, d, y, walls,
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
      northY: y + tiltRise, southY: y - tiltRise,
      minY: Math.min(y + tiltRise, y - tiltRise),
      maxY: Math.max(y + tiltRise, y - tiltRise),
    });
  }
  return out;
}

/** World-space band occupied by one wall letter. */
function wallBand(t, letter) {
  const e = WALL_THICKNESS;
  if (letter === 'N') return { minX: t.minX - e, maxX: t.maxX + e, minZ: t.minZ - e, maxZ: t.minZ, y: t.northY };
  if (letter === 'S') return { minX: t.minX - e, maxX: t.maxX + e, minZ: t.maxZ, maxZ: t.maxZ + e, y: t.southY };
  if (letter === 'E') return { minX: t.maxX, maxX: t.maxX + e, minZ: t.minZ, maxZ: t.maxZ, y: t.y };
  return { minX: t.minX - e, maxX: t.minX, minZ: t.minZ, maxZ: t.maxZ, y: t.y };
}

/** True when the band sits over `other`'s surface at a height the ball uses. */
function blocks(band, other) {
  const ox = Math.min(band.maxX, other.maxX) - Math.max(band.minX, other.minX);
  const oz = Math.min(band.maxZ, other.maxZ) - Math.max(band.minZ, other.minZ);
  // Needs real area over the other tile, not a shared edge.
  if (ox <= 0.05 || oz <= 0.05) return false;
  const heights = [other.northY, other.southY, other.minY, other.maxY];
  return heights.some((h) => Math.abs(h - band.y) <= STEP_TOLERANCE);
}

let found = 0;
for (const file of FILES) {
  const path = `src/course/courses/${file}.ts`;
  let src = readFileSync(path, 'utf8');
  const holes = src.split(/\n\s*\{\s*\n\s*id: '/).slice(1);
  for (const chunk of holes) {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const tiles = tilesOf(chunk);
    for (const t of tiles) {
      if (!t.walls) continue;
      const keep = [];
      for (const letter of t.walls) {
        const band = wallBand(t, letter);
        const victim = tiles.find((o) => o !== t && blocks(band, o));
        if (victim) {
          found++;
          console.log(
            `[WALL] ${id}: tile(${t.x},${t.z}) wall '${letter}' stands on tile(${victim.x},${victim.z})`,
          );
        } else {
          keep.push(letter);
        }
      }
      if (FIX && keep.length !== t.walls.length) {
        const fixed = t.raw.replace(/walls:\s*'[NSEW]*'/, `walls: '${keep.join('')}'`);
        src = src.replace(t.raw, fixed);
      }
    }
  }
  if (FIX) writeFileSync(path, src);
}

console.log(`\n${found} blocking wall(s)${FIX ? ' — stripped' : ''}`);
process.exit(found && !FIX ? 1 : 0);

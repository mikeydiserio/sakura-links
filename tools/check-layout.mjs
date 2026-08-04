/**
 * Standalone tee-to-cup connectivity check for the three course files.
 *
 * `src/dev/ValidateLayout.ts` does this properly, but it only runs inside the
 * browser because it imports the TypeScript course modules. That made it
 * useless as a verification loop for anything without a browser — which is
 * exactly how a batch of course edits once shipped with eighteen holes whose
 * cups could not be reached.
 *
 * This mirrors the same rules by parsing the course files as text, so it runs
 * anywhere `node` does:
 *   node tools/check-layout.mjs
 * Exit code is 1 if any hole is disconnected, so it can gate a commit.
 *
 * It is deliberately a *subset* of the real validator — connectivity only. The
 * browser one remains the source of truth for floor coverage and furniture
 * heights; run both before believing a course is sound.
 */
import { readFileSync } from 'node:fs';

const GAP_TOLERANCE = 0.3;
const STEP_TOLERANCE = 0.32;
const FILES = ['sakura', 'skyIslands', 'neonArcade'];

/** Reads `key: <number>` out of a piece's source text. */
const num = (src, key, fallback) => {
  const m = new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`).exec(src);
  return m ? Number(m[1]) : fallback;
};

function footprintsFor(src) {
  const out = [];
  // Each piece is a single `{ kind: '...' ... }` object on one or more lines.
  const re = /\{\s*kind:\s*'(\w+)'([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const [, kind, body] = m;
    const x = num(body, 'x', 0);
    const z = num(body, 'z', 0);
    const y = num(body, 'y', 0);

    if (kind === 'tile') {
      const w = num(body, 'w', 0);
      const d = num(body, 'd', 0);
      const tilt = num(body, 'tilt', 0);
      const roll = num(body, 'roll', 0);
      const rotY = num(body, 'rotY', 0);
      const halfW = (Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d) / 2;
      const halfD = (Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d) / 2;
      const tiltRise = (Math.sin(tilt) * d) / 2;
      const rollRise = (Math.sin(roll) * w) / 2;
      const northY = y + tiltRise;
      const southY = y - tiltRise;
      const eastY = y + rollRise;
      const westY = y - rollRise;
      out.push({
        label: `tile(${x},${z})`,
        minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD,
        northY, southY,
        minY: Math.min(northY, southY, westY, eastY),
        maxY: Math.max(northY, southY, westY, eastY),
        launcher: false,
      });
    } else if (kind === 'elevator') {
      const w = num(body, 'w', 0), d = num(body, 'd', 0);
      const low = num(body, 'low', 0), high = num(body, 'high', 0);
      out.push({
        label: `elevator(${x},${z})`,
        minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
        northY: low, southY: low, minY: Math.min(low, high), maxY: Math.max(low, high),
        launcher: false,
      });
    } else if (kind === 'mover') {
      const w = num(body, 'w', 0), d = num(body, 'd', 0);
      const dist = num(body, 'distance', 0);
      const axis = /axis:\s*'(\w)'/.exec(body)?.[1] ?? 'x';
      const ex = axis === 'x' ? dist : 0;
      const ez = axis === 'z' ? dist : 0;
      out.push({
        label: `mover(${x},${z})`,
        minX: x - w / 2 - ex, maxX: x + w / 2 + ex,
        minZ: z - d / 2 - ez, maxZ: z + d / 2 + ez,
        northY: y, southY: y, minY: y, maxY: y, launcher: false,
      });
    } else if (kind === 'rotator') {
      const r = num(body, 'radius', 0);
      out.push({
        label: `rotator(${x},${z})`,
        minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r,
        northY: y, southY: y, minY: y, maxY: y, launcher: false,
      });
    } else if (kind === 'jump' || kind === 'booster') {
      const w = num(body, 'w', 1.4), d = num(body, 'd', 2.2);
      out.push({
        label: `${kind}(${x},${z})`,
        minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
        northY: y, southY: y, minY: y, maxY: y, launcher: true,
      });
    }
  }
  return out;
}

function connected(a, b) {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  const touching =
    (overlapX > 0.15 && overlapZ > -GAP_TOLERANCE) || (overlapZ > 0.15 && overlapX > -GAP_TOLERANCE);
  if (!touching) return false;
  if (a.launcher || b.launcher) return true;
  for (const ay of [a.northY, a.southY, a.minY, a.maxY]) {
    for (const by of [b.northY, b.southY, b.minY, b.maxY]) {
      if (Math.abs(ay - by) <= STEP_TOLERANCE) return true;
    }
  }
  return false;
}

const contains = (f, x, z) => x >= f.minX - 0.4 && x <= f.maxX + 0.4 && z >= f.minZ - 0.4 && z <= f.maxZ + 0.4;

/**
 * Steepest ramp the perimeter rails can contain.
 *
 * A ball leaving a ramp of angle t at launch speed v rises (v*sin t)^2 / 2g.
 * At MAX_SHOT_SPEED = 26 and g = 20 that is 0.96 for t = 0.24, which is what
 * DEFAULT_WALL_HEIGHT = 1.05 is sized against. A steeper ramp throws a
 * full-power shot clean over the rails and out of the course — so this is a
 * playability limit, not a style preference, and it belongs in the same gate as
 * connectivity.
 */
const MAX_TILT = 0.24;

let failures = 0;
let holes = 0;
for (const file of FILES) {
  const src = readFileSync(`src/course/courses/${file}.ts`, 'utf8');
  for (const chunk of src.split(/\n\s*\{\s*\n\s*id: '/).slice(1)) {
    const id = chunk.slice(0, chunk.indexOf("'"));

    const tiltRe = /\{\s*kind:\s*'tile'([^{}]*)\}/g;
    let t;
    while ((t = tiltRe.exec(chunk))) {
      for (const key of ['tilt', 'roll']) {
        const v = num(t[1], key, 0);
        if (Math.abs(v) > MAX_TILT + 1e-9) {
          const rise = ((26 * Math.sin(Math.abs(v))) ** 2 / 40).toFixed(2);
          console.log(
            `[ERR ] ${id}: ${key} ${v} exceeds ${MAX_TILT} — a full-power ball would rise ${rise}u ` +
              `over 1.05u rails and leave the course`,
          );
          failures++;
        }
      }
    }
    const tee = /tee: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+) \}/.exec(chunk);
    const cup = /cup: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+) \}/.exec(chunk);
    if (!tee || !cup) continue;
    holes++;
    const fps = footprintsFor(chunk);
    const teeIdx = fps.findIndex((f) => contains(f, +tee[1], +tee[3]));
    const cupIdx = fps.findIndex((f) => contains(f, +cup[1], +cup[3]));
    if (teeIdx < 0) { console.log(`[ERR ] ${id}: tee sits on no surface`); failures++; continue; }
    if (cupIdx < 0) { console.log(`[ERR ] ${id}: cup sits on no surface`); failures++; continue; }

    const seen = new Set([teeIdx]);
    const queue = [teeIdx];
    while (queue.length) {
      const i = queue.pop();
      for (let j = 0; j < fps.length; j++) {
        if (!seen.has(j) && connected(fps[i], fps[j])) { seen.add(j); queue.push(j); }
      }
    }
    if (!seen.has(cupIdx)) {
      // Report the nearest unbridged pair so the fix is obvious.
      let best = null;
      for (const i of seen) {
        for (let j = 0; j < fps.length; j++) {
          if (seen.has(j)) continue;
          const a = fps[i], b = fps[j];
          const gx = Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX);
          const gz = Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ);
          const gap = Math.max(gx, gz);
          if (!best || gap < best.gap) best = { gap, a: a.label, b: b.label };
        }
      }
      console.log(
        `[ERR ] ${id}: cup unreachable — nearest break ${best?.a} -> ${best?.b} (gap ${best?.gap.toFixed(2)}u)`,
      );
      failures++;
    }
  }
}
console.log(`\n${holes} holes, ${failures} disconnected`);
process.exit(failures ? 1 : 0);

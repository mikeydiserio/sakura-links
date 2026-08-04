/**
 * Fingerprints every hole and reports pairs that are the same idea.
 *
 *   node tools/check-uniqueness.mjs
 *
 * "Every hole should feel different" is easy to assert and hard to check by
 * reading twenty-four hole definitions, so this makes it measurable. Each hole
 * reduces to a small feature vector — overall shape, length, how many distinct
 * heights it uses, and which mechanics appear — and any pair scoring above the
 * similarity threshold is printed for a human to judge.
 *
 * It deliberately does NOT fail the build. Two holes sharing a mechanic is
 * often good design (a course teaches an idea, then tests it); what matters is
 * whether the *combination* repeats. This is a prompt to look, not a verdict.
 */
import { readFileSync } from 'node:fs';

const FILES = ['sakura', 'skyIslands', 'neonArcade'];
const num = (src, key, fallback) => {
  const m = new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`).exec(src);
  return m ? Number(m[1]) : fallback;
};

/** Mechanics that give a hole its identity. Decoration is deliberately excluded. */
const MECHANICS = [
  'water', 'bump', 'bumper', 'spinner', 'windmill',
  'elevator', 'mover', 'rotator', 'jump', 'booster',
];

function fingerprint(chunk, id) {
  const tee = /tee: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+) \}/.exec(chunk);
  const cup = /cup: \{ x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+) \}/.exec(chunk);
  if (!tee || !cup) return null;
  const tx = +tee[1], ty = +tee[2], tz = +tee[3];
  const cx = +cup[1], cy = +cup[2], cz = +cup[3];

  const mech = new Set();
  const heights = new Set();
  const surfaces = new Set();
  let tiles = 0;
  let ramps = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  const re = /\{\s*kind:\s*'(\w+)'([^{}]*)\}/g;
  let m;
  while ((m = re.exec(chunk))) {
    const [, kind, body] = m;
    if (MECHANICS.includes(kind)) mech.add(kind);
    const surf = /surface:\s*'(\w+)'/.exec(body)?.[1];
    if (surf) surfaces.add(surf);
    if (kind === 'tile') {
      tiles++;
      const x = num(body, 'x', 0), z = num(body, 'z', 0);
      const w = num(body, 'w', 0), d = num(body, 'd', 0);
      heights.add(Math.round(num(body, 'y', 0) * 4) / 4);
      if (Math.abs(num(body, 'tilt', 0)) > 0.02 || Math.abs(num(body, 'roll', 0)) > 0.02) ramps++;
      minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2);
      minZ = Math.min(minZ, z - d / 2); maxZ = Math.max(maxZ, z + d / 2);
    }
  }

  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const straightness = Math.abs(cx - tx) < 2.5 ? 'straight' : 'dogleg';
  return {
    id,
    par: num(chunk, 'par', 0),
    length: Math.hypot(cx - tx, cz - tz),
    climb: Math.abs(cy - ty),
    levels: heights.size,
    ramps,
    tiles,
    aspect: spanZ > 0 ? spanX / spanZ : 1,
    shape: straightness,
    mech: [...mech].sort(),
    surfaces: [...surfaces].sort(),
  };
}

function similarity(a, b) {
  let score = 0;
  // Mechanic set — the strongest identity signal.
  const setA = new Set(a.mech), setB = new Set(b.mech);
  const union = new Set([...setA, ...setB]);
  const inter = [...setA].filter((k) => setB.has(k)).length;
  score += union.size === 0 ? 0.35 : 0.35 * (inter / union.size);
  // Shape and vertical structure.
  if (a.shape === b.shape) score += 0.15;
  if (a.levels === b.levels) score += 0.15;
  if ((a.ramps > 0) === (b.ramps > 0)) score += 0.08;
  // Scale.
  if (Math.abs(a.length - b.length) < 3) score += 0.12;
  if (Math.abs(a.aspect - b.aspect) < 0.3) score += 0.08;
  if (a.par === b.par) score += 0.07;
  return score;
}

const holes = [];
for (const file of FILES) {
  const src = readFileSync(`src/course/courses/${file}.ts`, 'utf8');
  for (const chunk of src.split(/\n\s*\{\s*\n\s*id: '/).slice(1)) {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const fp = fingerprint(chunk, id);
    if (fp) holes.push(fp);
  }
}

console.log('HOLE        par  len  lvls ramps shape     mechanics');
for (const h of holes) {
  console.log(
    `${h.id.padEnd(11)} ${String(h.par).padEnd(4)} ${h.length.toFixed(0).padEnd(4)} ` +
      `${String(h.levels).padEnd(4)} ${String(h.ramps).padEnd(5)} ${h.shape.padEnd(9)} ${h.mech.join(',') || '-'}`,
  );
}

const THRESHOLD = 0.82;
const dupes = [];
for (let i = 0; i < holes.length; i++) {
  for (let j = i + 1; j < holes.length; j++) {
    const s = similarity(holes[i], holes[j]);
    if (s >= THRESHOLD) dupes.push({ a: holes[i].id, b: holes[j].id, s });
  }
}

console.log(`\n${holes.length} holes. Pairs scoring >= ${THRESHOLD} similarity:`);
if (dupes.length === 0) {
  console.log('  none — every hole is a distinct combination.');
} else {
  for (const d of dupes.sort((p, q) => q.s - p.s)) {
    console.log(`  ${d.s.toFixed(2)}  ${d.a}  ~  ${d.b}`);
  }
}

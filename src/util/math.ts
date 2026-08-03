/**
 * Small numeric helpers used across gameplay, animation and procedural generation.
 * Kept dependency-free so it can be imported from workers or shaders-adjacent code.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const inverseLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const remap = (v: number, a1: number, b1: number, a2: number, b2: number): number =>
  lerp(a2, b2, clamp01(inverseLerp(a1, b1, v)));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
};

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is the decay rate: higher converges faster. Use instead of a raw
 * `lerp(a, b, 0.1)` so behaviour is identical at 30 and 144 Hz.
 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Shortest signed angular difference from `a` to `b`, in radians. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const dampAngle = (a: number, b: number, lambda: number, dt: number): number =>
  a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

/** Deterministic 32-bit hash-based PRNG. Same seed always yields the same course dressing. */
export class Rng {
  private state: number;

  constructor(seed = 1) {
    // Avoid a zero state, which would lock the generator at 0.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** xorshift32 — fast, good enough for scattering foliage. */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }
}

/** Classic 2D value noise with smooth interpolation — used for terrain and cloud textures. */
export function valueNoise2D(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const h = (a: number, b: number): number => {
    let n = a * 374761393 + b * 668265263 + seed * 1442695040888963407;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 0xffffffff;
  };

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const n00 = h(xi, yi);
  const n10 = h(xi + 1, yi);
  const n01 = h(xi, yi + 1);
  const n11 = h(xi + 1, yi + 1);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** Fractal brownian motion over `valueNoise2D`. Returns roughly 0..1. */
export function fbm2D(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, y * freq, seed + i * 71) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number): number => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Formats seconds as `m:ss`. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Golf-style relative-to-par label: `E`, `-2`, `+3`. */
export function formatToPar(strokes: number, par: number): string {
  const d = strokes - par;
  if (d === 0) return 'E';
  return d > 0 ? `+${d}` : `${d}`;
}

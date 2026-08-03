import * as THREE from 'three';
import { fbm2D, Rng, TAU, clamp01 } from '../util/math';
import { markShared } from '../util/dispose';

/**
 * Every texture in the game is synthesised here — nothing is downloaded.
 *
 * Two techniques are used:
 *  - `DataTexture` for exact, tiny lookup tables (the lighting ramp) where we
 *    need pixel-perfect control and `NearestFilter`.
 *  - `CanvasTexture` for painterly detail (grass hatching, stone, water caustics,
 *    petals), drawn once at load and cached forever.
 *
 * Results are memoised by key so nine holes sharing a stone texture upload one.
 */
const cache = new Map<string, THREE.Texture>();

function memo(key: string, build: () => THREE.Texture): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = markShared(build());
  cache.set(key, tex);
  return tex;
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable — cannot generate textures.');
  return { c, ctx };
}

const hex = (v: number): string => `#${v.toString(16).padStart(6, '0')}`;

/**
 * The cel lighting ramp: an N-band step function from shadow to light.
 *
 * Band edges are hand-tuned rather than evenly spaced — the terminator sits at
 * ~0.5 (wrapped N·L) and the two lit bands are pushed close together so most of
 * a surface reads as "lit" with a decisive shadow edge, which is what sells the
 * anime look. NearestFilter is mandatory: any filtering re-introduces a gradient.
 */
export function rampTexture(bands = 4): THREE.DataTexture {
  const key = `ramp:${bands}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.DataTexture;

  const width = 64;
  const data = new Uint8Array(width * 4);

  // stops: [threshold, brightness, warmth] — warmth tints lit bands slightly
  // yellow and shadow bands slightly blue, an old cel-animation trick.
  const stops: Array<[number, number, number]> =
    bands === 3
      ? [
          [0.0, 0.32, -0.06],
          [0.5, 0.82, 0.0],
          [0.72, 1.0, 0.05],
        ]
      : [
          [0.0, 0.28, -0.07],
          [0.44, 0.6, -0.02],
          [0.6, 0.88, 0.02],
          [0.82, 1.0, 0.06],
        ];

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    let brightness = stops[0][1];
    let warmth = stops[0][2];
    for (const [threshold, b, w] of stops) {
      if (t >= threshold) {
        brightness = b;
        warmth = w;
      }
    }
    const r = clamp01(brightness + warmth * 0.9);
    const g = clamp01(brightness + warmth * 0.25);
    const b2 = clamp01(brightness - warmth * 0.8);
    data[i * 4 + 0] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b2 * 255);
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  markShared(tex);
  cache.set(key, tex);
  return tex;
}

/**
 * Hand-drawn-looking grass.
 *
 * `mown` adds the mowing stripes that identify a putting surface. The
 * surrounding terrain deliberately passes `false`: striping the whole world
 * makes the course stop reading as a course, because the thing that marks it
 * out as maintained ground is exactly that its neighbours are not.
 */
export function grassTexture(base: number, alt: number, mown = true): THREE.Texture {
  return memo(`grass:${base}:${alt}:${mown ? 'mown' : 'wild'}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, size, size);

    // Large soft patches break up the flat colour without reading as noise.
    const img = ctx.getImageData(0, 0, size, size);
    const altColor = new THREE.Color(alt);
    const baseColor = new THREE.Color(base);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2D(x / 40, y / 40, 4, 12);
        const t = clamp01((n - 0.42) * 2.2);
        const i = (y * size + x) * 4;
        img.data[i + 0] = Math.round(
          THREE.MathUtils.lerp(baseColor.r, altColor.r, t) * 255,
        );
        img.data[i + 1] = Math.round(
          THREE.MathUtils.lerp(baseColor.g, altColor.g, t) * 255,
        );
        img.data[i + 2] = Math.round(
          THREE.MathUtils.lerp(baseColor.b, altColor.b, t) * 255,
        );
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Mowing stripes. These do most of the work: a cel-shaded green lit by one
    // directional light has almost no value variation of its own, so without
    // stripes a fairway reads as a flat sheet of colour. Alternating light and
    // dark bands (rather than light-on-nothing) doubles the contrast for the
    // same subtlety.
    const rng = new Rng(7);
    if (mown) {
      for (let x = 0; x < size; x += 32) {
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, 0, 16, size);
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = '#0d2a12';
        ctx.fillRect(x + 16, 0, 16, size);
      }

      // A faint roller mark along each stripe boundary sharpens the banding.
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#0d2a12';
      for (let x = 0; x < size; x += 16) ctx.fillRect(x, 0, 1.5, size);
    }

    // Short hatch marks suggest individual blades at close range.
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 900; i++) {
      const x = rng.range(0, size);
      const y = rng.range(0, size);
      const len = rng.range(2, 6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(-1, 1), y - len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
}

/** Irregular stone blocks with mortar lines and speckle. */
export function stoneTexture(base: number, top: number): THREE.Texture {
  return memo(`stone:${base}:${top}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, size, size);

    // Ten courses rather than six: at the rail's real height a six-row texture
    // gives blocks the size of the ball, which reads as a castle wall instead
    // of a kerb.
    const rows = 10;
    const h = size / rows;
    const rng = new Rng(21);
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * h * 0.9;
      let x = -offset;
      while (x < size) {
        const w = rng.range(h * 1.1, h * 2.2);
        const shade = rng.range(-0.09, 0.11);
        const cc = new THREE.Color(base).offsetHSL(0, rng.range(-0.02, 0.02), shade);
        ctx.fillStyle = `#${cc.getHexString()}`;
        ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        x += w;
      }
    }

    // Top-edge highlight sells a bevelled, sculpted block.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = hex(top);
    for (let r = 0; r < rows; r++) ctx.fillRect(0, r * h + 2, size, 3);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = rng.bool() ? '#000000' : '#ffffff';
      ctx.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Sand: fine grain plus raked concentric arcs, zen-garden style. */
export function sandTexture(base: number): THREE.Texture {
  return memo(`sand:${base}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, size, size);

    const rng = new Rng(33);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = rng.bool() ? '#ffffff' : '#a08a5c';
      ctx.fillRect(rng.range(0, size), rng.range(0, size), 1.5, 1.5);
    }

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let r = 12; r < size; r += 14) {
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.1; a += 0.1) {
        const rr = r + Math.sin(a * 3) * 3;
        const x = size / 2 + Math.cos(a) * rr;
        const y = size / 2 + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Wood planking for bridges and decking. */
export function woodTexture(base: number): THREE.Texture {
  return memo(`wood:${base}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    const rng = new Rng(55);
    const planks = 8;
    const h = size / planks;
    for (let i = 0; i < planks; i++) {
      const cc = new THREE.Color(base).offsetHSL(0, 0, rng.range(-0.07, 0.07));
      ctx.fillStyle = `#${cc.getHexString()}`;
      ctx.fillRect(0, i * h, size, h);
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(0, i * h + h);
      ctx.lineTo(size, i * h + h);
      ctx.stroke();
      // Grain: long wobbling strokes along the plank.
      ctx.globalAlpha = 0.09;
      for (let g = 0; g < 5; g++) {
        ctx.beginPath();
        const y0 = i * h + rng.range(3, h - 3);
        ctx.moveTo(0, y0);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + g) * 1.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Arcade floor: dark panel with a glowing grid, tuned for the bloom pass. */
export function gridTexture(base: number, line: number): THREE.Texture {
  return memo(`grid:${base}:${line}`, () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = hex(line);
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i <= size; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Soft radial falloff — blob shadows, glow sprites, light shafts. */
export function radialTexture(inner = '#ffffff', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  return memo(`radial:${inner}:${outer}`, () => {
    const size = 128;
    const { c, ctx } = canvas(size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Five-petal cherry blossom, used for falling petals and tree canopies. */
export function petalTexture(color = '#ffb3d1'): THREE.Texture {
  return memo(`petal:${color}`, () => {
    const size = 64;
    const { c, ctx } = canvas(size);
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      ctx.ellipse(0, -14, 8, 13, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#fff4f8';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Four-point anime sparkle for hole-in celebrations and boost pads. */
export function sparkTexture(color = '#ffffff'): THREE.Texture {
  return memo(`spark:${color}`, () => {
    const size = 64;
    const { c, ctx } = canvas(size);
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.45, 0, TAU);
    ctx.fill();

    // Cross-shaped flare spikes.
    ctx.fillStyle = color;
    ctx.translate(half, half);
    for (let i = 0; i < 2; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, half);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Puffy stylised cloud sprite built from overlapping discs. */
export function cloudTexture(): THREE.Texture {
  return memo('cloud', () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    const rng = new Rng(91);
    ctx.fillStyle = '#ffffff';
    const lobes = 14;
    for (let i = 0; i < lobes; i++) {
      const t = i / lobes;
      const x = 30 + t * (size - 60) + rng.range(-14, 14);
      const y = size * 0.6 - Math.sin(t * Math.PI) * 44 + rng.range(-10, 10);
      const r = rng.range(24, 46) * (0.55 + Math.sin(t * Math.PI) * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    // Feather the edge so the sprite reads soft against the sky gradient.
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const px = (i / 4) % size;
      const py = Math.floor(i / 4 / size);
      const edge = Math.min(px, py, size - px, size - py) / 28;
      img.data[i + 3] = Math.round(img.data[i + 3] * clamp01(edge));
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Caustic-ish ripple mask driven by two rotated noise fields. */
export function waterNoiseTexture(): THREE.Texture {
  return memo('waternoise', () => {
    const size = 128;
    const { c, ctx } = canvas(size);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = fbm2D(x / 18, y / 18, 3, 5);
        const b = fbm2D((x + 40) / 11, (y - 25) / 11, 3, 99);
        const v = clamp01(Math.abs(a - b) * 3.2);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  });
}

/** Dimples give the ball a readable spin cue while it rolls. */
export function ballTexture(): THREE.Texture {
  return memo('ball', () => {
    const size = 256;
    const { c, ctx } = canvas(size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    const step = 18;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const ox = (y / step) % 2 === 0 ? 0 : step / 2;
        ctx.beginPath();
        ctx.arc(x + ox, y, 5, 0, TAU);
        ctx.fill();
      }
    }
    // A single coloured band makes rotation legible at speed.
    ctx.fillStyle = '#ff5f8f';
    ctx.fillRect(0, size * 0.46, size, size * 0.05);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Releases every cached texture. Only used on full teardown. */
export function disposeTextureCache(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}

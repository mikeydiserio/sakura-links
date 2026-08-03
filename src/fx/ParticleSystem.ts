import * as THREE from 'three';
import { sparkTexture, radialTexture, petalTexture } from '../render/TextureFactory';
import { LAYER_NO_EDGE } from '../render/Renderer';
import { Rng, TAU, clamp01 } from '../util/math';

/**
 * Pooled GPU particle system for impacts, splashes, sand puffs and sparkles.
 *
 * One `Points` cloud per *look* (spark / puff / splash / clipping), each backed
 * by fixed-size typed arrays. Emitting never allocates: it claims the oldest
 * slot from a free list and writes into place. Dead particles are collapsed to
 * zero size rather than removed, so the draw call and buffer layout are stable
 * for the whole session.
 */

export type BurstKind = 'spark' | 'puff' | 'splash' | 'clipping' | 'confetti';

interface Pool {
  kind: BurstKind;
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  rotation: Float32Array;
  spin: Float32Array;
  cursor: number;
  count: number;
  gravity: number;
  drag: number;
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aRotation;
  attribute vec3 aColor;

  uniform float uPixelScale;

  varying float vAlpha;
  varying float vRotation;
  varying vec3 vColor;

  void main() {
    vRotation = aRotation;
    vColor = aColor;

    // Fade in over the first 15% of life, out over the remainder — a pure
    // linear fade reads as a pop at spawn.
    float t = clamp(aLife, 0.0, 1.0);
    vAlpha = smoothstep(0.0, 0.15, t) * smoothstep(0.0, 0.75, t);

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Particles shrink as they die, which fakes dissipation cheaply.
    gl_PointSize = aSize * (0.35 + t * 0.65) * uPixelScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;

  varying float vAlpha;
  varying float vRotation;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float s = sin(vRotation);
    float c = cos(vRotation);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;

    vec4 texel = texture2D(uTexture, uv);
    float alpha = texel.a * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(texel.rgb * vColor, alpha);
  }
`;

export class ParticleSystem {
  readonly group = new THREE.Group();
  private pools = new Map<BurstKind, Pool>();
  private rng = new Rng(4242);

  constructor() {
    this.group.name = 'particles';
    this.group.layers.set(LAYER_NO_EDGE);

    this.createPool('spark', 260, sparkTexture('#ffffff'), THREE.AdditiveBlending, -6, 1.6);
    this.createPool('puff', 200, radialTexture('rgba(255,255,255,0.9)'), THREE.NormalBlending, -2.4, 3.2);
    this.createPool('splash', 220, radialTexture('rgba(255,255,255,0.95)'), THREE.NormalBlending, -14, 0.6);
    this.createPool('clipping', 180, petalTexture('#ffffff'), THREE.NormalBlending, -13, 1.1);
    this.createPool('confetti', 240, petalTexture('#ffffff'), THREE.NormalBlending, -5.5, 0.9);
  }

  private createPool(
    kind: BurstKind,
    count: number,
    texture: THREE.Texture,
    blending: THREE.Blending,
    gravity: number,
    drag: number,
  ): void {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const life = new Float32Array(count);
    const maxLife = new Float32Array(count);
    const rotation = new Float32Array(count);
    const spin = new Float32Array(count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotation, 1));
    // Particles are emitted anywhere in the level; a fixed huge bounding sphere
    // is cheaper and safer than recomputing it every frame.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: {
        uTexture: { value: texture },
        uPixelScale: { value: 1 },
      },
    });

    const points = new THREE.Points(geometry, material);
    points.name = `particles:${kind}`;
    points.frustumCulled = false;
    points.layers.set(LAYER_NO_EDGE);
    points.renderOrder = 20;
    this.group.add(points);

    this.pools.set(kind, {
      kind,
      points,
      material,
      positions,
      velocities,
      colors,
      sizes,
      life,
      maxLife,
      rotation,
      spin,
      cursor: 0,
      count,
      gravity,
      drag,
    });
  }

  setViewportHeight(height: number): void {
    for (const pool of this.pools.values()) pool.material.uniforms.uPixelScale.value = height / 1080;
  }

  /**
   * Emits a burst. `spread` is the cone half-angle in radians about `normal`;
   * pass `Math.PI` for an omnidirectional puff.
   */
  emit(
    kind: BurstKind,
    origin: THREE.Vector3,
    options: {
      count?: number;
      speed?: number;
      spread?: number;
      normal?: THREE.Vector3;
      color?: THREE.Color | number;
      size?: number;
      life?: number;
    } = {},
  ): void {
    const pool = this.pools.get(kind);
    if (!pool) return;

    const {
      count = 12,
      speed = 3,
      spread = 0.9,
      normal = UP,
      color = 0xffffff,
      size = 90,
      life = 0.6,
    } = options;

    const tint = color instanceof THREE.Color ? color : SCRATCH_COLOR.setHex(color);

    // Build an orthonormal basis around `normal` so the cone can be sampled
    // without trigonometry per axis.
    BASIS_Z.copy(normal).normalize();
    BASIS_X.set(BASIS_Z.z, 0, -BASIS_Z.x);
    if (BASIS_X.lengthSq() < 1e-6) BASIS_X.set(1, 0, 0);
    BASIS_X.normalize();
    BASIS_Y.crossVectors(BASIS_Z, BASIS_X);

    for (let n = 0; n < count; n++) {
      const i = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.count;

      const p = i * 3;
      pool.positions[p] = origin.x + this.rng.range(-0.04, 0.04);
      pool.positions[p + 1] = origin.y + this.rng.range(-0.04, 0.04);
      pool.positions[p + 2] = origin.z + this.rng.range(-0.04, 0.04);

      const angle = this.rng.range(0, TAU);
      // sqrt keeps the sample density even across the cone's cross-section.
      const radial = Math.sin(spread) * Math.sqrt(this.rng.next());
      const axial = Math.sqrt(Math.max(0, 1 - radial * radial));
      const magnitude = speed * this.rng.range(0.55, 1.35);

      pool.velocities[p] =
        (BASIS_X.x * Math.cos(angle) * radial + BASIS_Y.x * Math.sin(angle) * radial + BASIS_Z.x * axial) *
        magnitude;
      pool.velocities[p + 1] =
        (BASIS_X.y * Math.cos(angle) * radial + BASIS_Y.y * Math.sin(angle) * radial + BASIS_Z.y * axial) *
        magnitude;
      pool.velocities[p + 2] =
        (BASIS_X.z * Math.cos(angle) * radial + BASIS_Y.z * Math.sin(angle) * radial + BASIS_Z.z * axial) *
        magnitude;

      const variance = this.rng.range(0.82, 1.18);
      pool.colors[p] = tint.r * variance;
      pool.colors[p + 1] = tint.g * variance;
      pool.colors[p + 2] = tint.b * variance;

      pool.sizes[i] = size * this.rng.range(0.7, 1.35);
      pool.maxLife[i] = life * this.rng.range(0.75, 1.3);
      pool.life[i] = 1;
      pool.rotation[i] = this.rng.range(0, TAU);
      pool.spin[i] = this.rng.range(-9, 9);
    }
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) {
      const { positions, velocities, life, maxLife, rotation, spin, count, gravity, drag } = pool;
      let alive = false;

      const decay = Math.exp(-drag * dt);

      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        alive = true;

        life[i] -= dt / maxLife[i];
        if (life[i] <= 0) {
          life[i] = 0;
          continue;
        }

        const p = i * 3;
        velocities[p] *= decay;
        velocities[p + 1] = velocities[p + 1] * decay + gravity * dt;
        velocities[p + 2] *= decay;

        positions[p] += velocities[p] * dt;
        positions[p + 1] += velocities[p + 1] * dt;
        positions[p + 2] += velocities[p + 2] * dt;

        rotation[i] += spin[i] * dt;
      }

      if (!alive) continue;
      const geometry = pool.points.geometry;
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** Convenience presets so callers do not repeat tuning constants. */
  impact(position: THREE.Vector3, normal: THREE.Vector3, strength: number, color: number): void {
    const amount = Math.round(4 + clamp01(strength / 14) * 14);
    this.emit('spark', position, {
      count: amount,
      speed: 2.4 + strength * 0.35,
      spread: 1.1,
      normal,
      color,
      size: 70,
      life: 0.34,
    });
  }

  grassClippings(position: THREE.Vector3, strength: number, color: number): void {
    this.emit('clipping', position, {
      count: Math.round(3 + clamp01(strength / 16) * 9),
      speed: 1.6 + strength * 0.22,
      spread: 0.85,
      normal: UP,
      color,
      size: 42,
      life: 0.7,
    });
  }

  sandPuff(position: THREE.Vector3, strength: number, color: number): void {
    this.emit('puff', position, {
      count: Math.round(6 + clamp01(strength / 12) * 12),
      speed: 1.1 + strength * 0.2,
      spread: 1.35,
      normal: UP,
      color,
      size: 150,
      life: 0.9,
    });
  }

  splash(position: THREE.Vector3, strength: number, color: number): void {
    this.emit('splash', position, {
      count: Math.round(16 + clamp01(strength / 12) * 22),
      speed: 3.4 + strength * 0.35,
      spread: 0.75,
      normal: UP,
      color,
      size: 110,
      life: 0.8,
    });
    this.emit('puff', position, {
      count: 8,
      speed: 1.2,
      spread: 1.4,
      normal: UP,
      color: 0xffffff,
      size: 170,
      life: 1,
    });
  }

  celebrate(position: THREE.Vector3, colorA: number, colorB: number): void {
    this.emit('confetti', position, {
      count: 60,
      speed: 5.5,
      spread: 1.0,
      normal: UP,
      color: colorA,
      size: 110,
      life: 1.5,
    });
    this.emit('confetti', position, {
      count: 40,
      speed: 4.2,
      spread: Math.PI,
      normal: UP,
      color: colorB,
      size: 90,
      life: 1.7,
    });
    this.emit('spark', position, {
      count: 40,
      speed: 6.5,
      spread: Math.PI,
      normal: UP,
      color: 0xffffff,
      size: 130,
      life: 0.9,
    });
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.points.geometry.dispose();
      pool.material.dispose();
    }
    this.pools.clear();
    this.group.parent?.remove(this.group);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const BASIS_X = new THREE.Vector3();
const BASIS_Y = new THREE.Vector3();
const BASIS_Z = new THREE.Vector3();
const SCRATCH_COLOR = new THREE.Color();

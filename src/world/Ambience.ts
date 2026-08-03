import * as THREE from 'three';
import { petalTexture, sparkTexture, radialTexture } from '../render/TextureFactory';
import { LAYER_NO_EDGE } from '../render/Renderer';
import { Rng, TAU } from '../util/math';
import type { Theme } from '../render/Palette';

/**
 * Ambient life that sells the world as inhabited: falling cherry petals,
 * fireflies, butterflies and drifting arcade motes.
 *
 * All three effects share one `Points` cloud per type with per-particle state in
 * plain typed arrays. Positions are written into a single interleaved buffer
 * each frame — no per-particle objects, no allocation, no garbage.
 *
 * Particles wrap inside a box that follows the camera, so density stays constant
 * wherever the player is and the count never has to scale with course size.
 */

type AmbienceKind = 'petals' | 'fireflies' | 'motes' | 'butterflies';

const petalVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSpin;
  attribute vec3 aColor;

  uniform float uPixelScale;

  varying float vSpin;
  varying vec3 vColor;

  void main() {
    vSpin = aSpin;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Perspective-correct point size: divide by view depth so particles shrink
    // naturally with distance the way real geometry would.
    gl_PointSize = aSize * uPixelScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const petalFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;

  varying float vSpin;
  varying vec3 vColor;

  void main() {
    // Rotate the sprite UVs so petals tumble as they fall — a still sprite
    // reads as dust, a rotating one reads as a petal.
    vec2 uv = gl_PointCoord - 0.5;
    float s = sin(vSpin);
    float c = cos(vSpin);
    uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;

    vec4 texel = texture2D(uTexture, uv);
    if (texel.a < 0.05) discard;
    gl_FragColor = vec4(texel.rgb * vColor, texel.a * uOpacity);
  }
`;

interface ParticleField {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  spins: Float32Array;
  spinRates: Float32Array;
  phases: Float32Array;
  count: number;
  kind: AmbienceKind;
}

export class Ambience {
  readonly group = new THREE.Group();

  private fields: ParticleField[] = [];
  private readonly bounds = new THREE.Vector3(46, 26, 46);
  private readonly center = new THREE.Vector3();

  constructor() {
    this.group.name = 'ambience';
    // Ambient particles must not be traced by the Sobel pass — thousands of
    // tiny outlined dots would read as noise.
    this.group.layers.set(LAYER_NO_EDGE);
  }

  build(theme: Theme): void {
    this.clear();

    if (theme.id === 'sakura') {
      this.fields.push(this.createField('petals', 220, theme));
      this.fields.push(this.createField('butterflies', 18, theme));
      this.fields.push(this.createField('fireflies', 40, theme));
    } else if (theme.id === 'sky') {
      this.fields.push(this.createField('motes', 160, theme));
      this.fields.push(this.createField('butterflies', 12, theme));
    } else {
      this.fields.push(this.createField('motes', 240, theme));
      this.fields.push(this.createField('fireflies', 70, theme));
    }

    for (const field of this.fields) this.group.add(field.points);
  }

  private createField(kind: AmbienceKind, count: number, theme: Theme): ParticleField {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const spins = new Float32Array(count);
    const spinRates = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const rng = new Rng(kind.length * 977 + count);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = rng.range(-this.bounds.x / 2, this.bounds.x / 2);
      positions[i * 3 + 1] = rng.range(0, this.bounds.y);
      positions[i * 3 + 2] = rng.range(-this.bounds.z / 2, this.bounds.z / 2);

      switch (kind) {
        case 'petals':
          velocities[i * 3 + 0] = rng.range(0.35, 1.05);
          velocities[i * 3 + 1] = -rng.range(0.35, 0.85);
          velocities[i * 3 + 2] = rng.range(-0.3, 0.3);
          sizes[i] = rng.range(140, 260);
          color.setHex(theme.accent).offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.05, 0.16));
          break;
        case 'fireflies':
          velocities[i * 3 + 0] = rng.range(-0.25, 0.25);
          velocities[i * 3 + 1] = rng.range(-0.1, 0.1);
          velocities[i * 3 + 2] = rng.range(-0.25, 0.25);
          sizes[i] = rng.range(60, 130);
          color.setHex(theme.id === 'neon' ? theme.accent : 0xfff0a0);
          break;
        case 'butterflies':
          velocities[i * 3 + 0] = rng.range(-0.9, 0.9);
          velocities[i * 3 + 1] = rng.range(-0.15, 0.15);
          velocities[i * 3 + 2] = rng.range(-0.9, 0.9);
          sizes[i] = rng.range(150, 240);
          color.setHex(rng.pick([0xfff3a0, 0xffb3d1, 0xbfe3ff, 0xffffff]));
          break;
        default:
          velocities[i * 3 + 0] = rng.range(-0.12, 0.12);
          velocities[i * 3 + 1] = rng.range(0.06, 0.3);
          velocities[i * 3 + 2] = rng.range(-0.12, 0.12);
          sizes[i] = rng.range(40, 110);
          color.setHex(theme.id === 'neon' ? theme.accentAlt : 0xffffff);
          break;
      }

      spins[i] = rng.range(0, TAU);
      spinRates[i] = rng.range(-2.4, 2.4);
      phases[i] = rng.range(0, TAU);
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpin', new THREE.BufferAttribute(spins, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    const texture =
      kind === 'petals' || kind === 'butterflies'
        ? petalTexture('#ffffff')
        : kind === 'fireflies'
          ? sparkTexture('#ffffff')
          : radialTexture();

    const material = new THREE.ShaderMaterial({
      vertexShader: petalVertex,
      fragmentShader: petalFragment,
      transparent: true,
      depthWrite: false,
      blending: kind === 'fireflies' || kind === 'motes' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTexture: { value: texture },
        uOpacity: { value: kind === 'motes' ? 0.5 : 0.95 },
        uPixelScale: { value: 1 },
      },
    });

    const points = new THREE.Points(geometry, material);
    points.name = `ambience:${kind}`;
    points.frustumCulled = false;
    points.layers.set(LAYER_NO_EDGE);

    return {
      points,
      material,
      positions,
      velocities,
      spins,
      spinRates,
      phases,
      count,
      kind,
    };
  }

  /** Keeps point sizes stable across resolutions. */
  setViewportHeight(height: number): void {
    for (const field of this.fields) field.material.uniforms.uPixelScale.value = height / 1080;
  }

  update(dt: number, elapsed: number, focus: THREE.Vector3, wind: number): void {
    this.center.copy(focus);

    for (const field of this.fields) {
      const { positions, velocities, spins, spinRates, phases, count, kind } = field;

      for (let i = 0; i < count; i++) {
        const px = i * 3;
        const py = px + 1;
        const pz = px + 2;

        if (kind === 'petals') {
          // Sinusoidal sway on top of a constant fall makes petals flutter.
          positions[px] += (velocities[px] * wind + Math.sin(elapsed * 1.4 + phases[i]) * 0.5) * dt;
          positions[py] += velocities[py] * dt;
          positions[pz] += (velocities[pz] + Math.cos(elapsed * 1.1 + phases[i]) * 0.4) * dt;
          spins[i] += spinRates[i] * dt;
        } else if (kind === 'fireflies') {
          // Slow wander plus a vertical bob; the pulse comes from the shader's
          // additive blend so no per-particle opacity write is needed.
          positions[px] += (velocities[px] + Math.sin(elapsed * 0.7 + phases[i]) * 0.35) * dt;
          positions[py] += (velocities[py] + Math.sin(elapsed * 1.9 + phases[i]) * 0.25) * dt;
          positions[pz] += (velocities[pz] + Math.cos(elapsed * 0.6 + phases[i]) * 0.35) * dt;
        } else if (kind === 'butterflies') {
          // Figure-eight flight path — recognisably a butterfly, not a bug.
          const t = elapsed * 0.9 + phases[i];
          positions[px] += (velocities[px] + Math.sin(t) * 1.1) * dt;
          positions[py] += Math.sin(t * 2.6) * 0.5 * dt;
          positions[pz] += (velocities[pz] + Math.cos(t * 0.5) * 1.1) * dt;
          spins[i] = Math.sin(t * 6) * 0.5;
        } else {
          positions[px] += velocities[px] * dt;
          positions[py] += velocities[py] * dt;
          positions[pz] += velocities[pz] * dt;
          spins[i] += spinRates[i] * dt * 0.3;
        }

        // Toroidal wrap around the focus point.
        const hx = this.bounds.x / 2;
        const hz = this.bounds.z / 2;
        let dx = positions[px] - this.center.x;
        let dz = positions[pz] - this.center.z;
        if (dx > hx) dx -= this.bounds.x;
        else if (dx < -hx) dx += this.bounds.x;
        if (dz > hz) dz -= this.bounds.z;
        else if (dz < -hz) dz += this.bounds.z;
        positions[px] = this.center.x + dx;
        positions[pz] = this.center.z + dz;

        const relativeY = positions[py] - this.center.y;
        if (relativeY < -6) positions[py] = this.center.y + this.bounds.y;
        else if (relativeY > this.bounds.y) positions[py] = this.center.y - 5;
      }

      const geometry = field.points.geometry;
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aSpin as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    for (const field of this.fields) {
      field.points.geometry.dispose();
      field.material.dispose();
      this.group.remove(field.points);
    }
    this.fields = [];
  }

  dispose(): void {
    this.clear();
    this.group.parent?.remove(this.group);
  }
}

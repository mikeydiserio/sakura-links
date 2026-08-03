import * as THREE from 'three';
import { LAYER_NO_EDGE } from '../render/Renderer';
import { clamp01 } from '../util/math';

/**
 * Ribbon trail behind the ball.
 *
 * Implemented as a fixed-length ring buffer of world positions expanded into a
 * camera-facing triangle strip each frame. The geometry is allocated once at its
 * maximum size and only the attribute contents change — no resizing, no
 * per-frame allocation.
 *
 * The ribbon tapers to a point at the tail and fades with age, and its width is
 * driven by speed so a gentle tap barely marks the ground while a full-power
 * strike leaves a proper streak.
 */
const SEGMENTS = 26;

export class Trail {
  readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly history: Float32Array;
  private readonly ages: Float32Array;
  private head = 0;
  private filled = 0;
  private readonly material: THREE.ShaderMaterial;
  private emitTimer = 0;

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();

  constructor(color: THREE.ColorRepresentation) {
    this.history = new Float32Array(SEGMENTS * 3);
    this.ages = new Float32Array(SEGMENTS);
    this.positions = new Float32Array(SEGMENTS * 2 * 3);
    this.alphas = new Float32Array(SEGMENTS * 2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    // Triangle strip as indexed triangles: two per segment pair.
    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float a = vAlpha * uOpacity;
          // Written as a negated test so a NaN alpha discards. A plain
          // less-than test is false for NaN, which would let a non-finite
          // value into the colour buffer and poison the bloom chain.
          if (!(a > 0.004)) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'trail';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.layers.set(LAYER_NO_EDGE);
  }

  setColor(color: THREE.ColorRepresentation): void {
    (this.material.uniforms.uColor.value as THREE.Color).set(color);
  }

  clear(): void {
    this.head = 0;
    this.filled = 0;
    this.positions.fill(0);
    this.alphas.fill(0);
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number, ballPosition: THREE.Vector3, speed: number, camera: THREE.Camera): void {
    // Sample at a fixed spatial-ish rate: too often and the ribbon bunches at
    // low speed, too rarely and fast shots look like dashes.
    this.emitTimer += dt;
    const interval = speed > 1 ? 0.016 : 0.05;

    if (this.emitTimer >= interval) {
      this.emitTimer = 0;
      const i = this.head * 3;
      this.history[i] = ballPosition.x;
      this.history[i + 1] = ballPosition.y;
      this.history[i + 2] = ballPosition.z;
      this.ages[this.head] = 1;
      this.head = (this.head + 1) % SEGMENTS;
      this.filled = Math.min(SEGMENTS, this.filled + 1);
    }

    for (let i = 0; i < SEGMENTS; i++) this.ages[i] = Math.max(0, this.ages[i] - dt * 2.6);

    const width = 0.035 + clamp01(speed / 18) * 0.11;
    camera.getWorldPosition(this.toCamera);

    for (let n = 0; n < SEGMENTS; n++) {
      // Walk oldest → newest so the taper runs the right way.
      const index = (this.head + n) % SEGMENTS;
      const t = n / (SEGMENTS - 1);
      const src = index * 3;

      this.tmpA.set(this.history[src], this.history[src + 1], this.history[src + 2]);

      // Direction to the next sample gives the ribbon's spine.
      const nextIndex = (index + 1) % SEGMENTS;
      const nsrc = nextIndex * 3;
      this.tmpB
        .set(this.history[nsrc], this.history[nsrc + 1], this.history[nsrc + 2])
        .sub(this.tmpA);
      if (this.tmpB.lengthSq() < 1e-8) this.tmpB.set(0, 0, 0.001);

      // Billboard: cross the spine with the view vector so the ribbon always
      // presents its face to the camera. When the spine points straight at the
      // camera the cross product collapses and `normalize()` would yield NaN,
      // so fall back to a fixed axis rather than emitting non-finite vertices.
      this.side.copy(this.toCamera).sub(this.tmpA).cross(this.tmpB);
      if (this.side.lengthSq() < 1e-10) this.side.set(1, 0, 0);
      this.side.normalize().multiplyScalar(width * t);

      const out = n * 6;
      this.positions[out + 0] = this.tmpA.x + this.side.x;
      this.positions[out + 1] = this.tmpA.y + this.side.y;
      this.positions[out + 2] = this.tmpA.z + this.side.z;
      this.positions[out + 3] = this.tmpA.x - this.side.x;
      this.positions[out + 4] = this.tmpA.y - this.side.y;
      this.positions[out + 5] = this.tmpA.z - this.side.z;

      const alpha = this.filled > n ? this.ages[index] * t * clamp01(speed / 5) : 0;
      this.alphas[n * 2] = alpha;
      this.alphas[n * 2 + 1] = alpha;
    }

    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

import * as THREE from 'three';
import type { Theme } from '../render/Palette';
import { LAYER_NO_EDGE } from '../render/Renderer';

/**
 * Gradient sky dome with a painted sun, drifting procedural cloud bands and a
 * subtle star field for the night-time arcade theme.
 *
 * Rendered on an inverted sphere with `depthWrite: false` and a large render
 * order offset so it always sits behind everything without needing a huge far
 * plane. It lives on `LAYER_NO_EDGE`, keeping it out of the Sobel prepass —
 * otherwise the cloud bands would be traced with ink lines.
 */

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    // World-space direction from the camera, used for the gradient and sun.
    vDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uBottom;
  uniform vec3 uMid;
  uniform vec3 uTop;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uCloudAmount;
  uniform float uStars;

  varying vec3 vDirection;

  // Cheap hash/value-noise pair. Two octaves is plenty for soft cloud banding
  // and keeps the sky at a couple of ALU ops per pixel.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    v += 0.55 * noise(p);
    v += 0.30 * noise(p * 2.1);
    v += 0.15 * noise(p * 4.3);
    return v;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // uBottom is a horizon *glow*, not a colour for the whole lower hemisphere.
    // Letting it fill everything below h = 0.42 turns any view without ground
    // under it — every hole on the floating course — into a flat cream wash.
    // Falling away to a deep haze below the horizon line restores the sense
    // that there is a long way down.
    vec3 below = mix(uBottom * 0.42, uBottom, smoothstep(0.06, 0.44, h));

    // Two-stop gradient above, with the horizon band compressed into the lower
    // third, which is where a stylised sky wants its colour change.
    vec3 sky = mix(below, uMid, smoothstep(0.42, 0.58, h));
    sky = mix(sky, uTop, smoothstep(0.56, 0.95, h));

    // Painted sun: a hard disc with a quantised halo rather than a smooth glow.
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float disc = smoothstep(0.9975, 0.9985, sunDot);
    // The wide term used to be pow(sunDot, 12.0), which is still above a tenth
    // some 40 degrees off-axis — quantised to five steps that became a single
    // flat plateau of sun colour across most of the sky, and bloom then finished
    // the job. Tightening the exponent keeps the glow local to the sun, and more
    // quantisation steps keep the banding reading as deliberate.
    float halo = pow(sunDot, 90.0) * 0.5 + pow(sunDot, 40.0) * 0.12;
    halo = floor(halo * 8.0) / 8.0;
    sky += uSunColor * (disc * 1.6 + halo);

    // Stars fade in only where the palette is dark (the arcade night sky).
    if (uStars > 0.0) {
      vec2 sp = dir.xz / max(abs(dir.y) + 0.15, 0.001);
      float star = step(0.9965, hash(floor(sp * 90.0)));
      float twinkle = 0.6 + 0.4 * sin(uTime * 2.2 + hash(floor(sp * 90.0)) * 40.0);
      sky += vec3(star * twinkle * uStars) * smoothstep(0.05, 0.4, dir.y);
    }

    // Cloud bands: flattened UVs so clouds stretch toward the horizon like a
    // real sky, drifting on two axes at different rates for parallax.
    if (uCloudAmount > 0.0) {
      vec2 uv = dir.xz / max(dir.y * 0.9 + 0.25, 0.08);
      float clouds = fbm(uv * 0.55 + vec2(uTime * 0.008, uTime * 0.004));
      float mask = smoothstep(0.52, 0.78, clouds) * smoothstep(0.0, 0.25, dir.y);
      // Quantise into three density steps — flat cel clouds, not fog.
      mask = floor(mask * 3.0) / 3.0;
      vec3 cloudColor = mix(uMid, vec3(1.0), 0.82);
      sky = mix(sky, cloudColor, mask * uCloudAmount);
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uBottom: { value: new THREE.Color(0xffe3ec) },
        uMid: { value: new THREE.Color(0xa8d5ff) },
        uTop: { value: new THREE.Color(0x4a7ed6) },
        uSunColor: { value: new THREE.Color(0xfff3d0) },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.4, -0.75).normalize() },
        uTime: { value: 0 },
        uCloudAmount: { value: 0.9 },
        uStars: { value: 0 },
      },
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), this.material);
    this.mesh.name = 'sky';
    this.mesh.scale.setScalar(600);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_NO_EDGE);
  }

  applyTheme(theme: Theme): void {
    const u = this.material.uniforms;
    (u.uBottom.value as THREE.Color).setHex(theme.skyBottom);
    (u.uMid.value as THREE.Color).setHex(theme.skyMid);
    (u.uTop.value as THREE.Color).setHex(theme.skyTop);
    (u.uSunColor.value as THREE.Color).setHex(theme.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(theme.sunPosition).normalize();
    u.uCloudAmount.value = theme.id === 'neon' ? 0.25 : 0.9;
    u.uStars.value = theme.id === 'neon' ? 0.9 : 0;
  }

  update(elapsed: number, cameraPosition: THREE.Vector3): void {
    this.material.uniforms.uTime.value = elapsed;
    // The dome follows the camera so it can stay small enough to avoid
    // precision issues while never being escaped.
    this.mesh.position.copy(cameraPosition);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

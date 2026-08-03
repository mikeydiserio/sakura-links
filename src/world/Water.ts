import * as THREE from 'three';
import { waterNoiseTexture } from '../render/TextureFactory';
import type { Theme } from '../render/Palette';

/**
 * Stylised water: flat cel bands, hand-drawn foam rings at the shoreline and
 * two scrolling noise fields for caustics.
 *
 * Deliberately *not* a reflective surface — no cube map, no screen-space
 * reflection. The look is painted: depth is communicated by two solid colours
 * and a quantised sparkle, matching the way water reads in cel animation.
 *
 * Vertex displacement is a pair of crossing sine waves; the ball never floats,
 * so the surface only has to look alive, not drive physics.
 */

const waterVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWaveHeight;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWave;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);

    // Two crossing waves at incommensurate frequencies avoid a visible tiling
    // period across a large pond.
    float w = sin(world.x * 0.9 + uTime * 1.4) * 0.5
            + sin(world.z * 1.27 - uTime * 1.05) * 0.5;
    world.y += w * uWaveHeight;

    vWave = w;
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uLightColor;
  uniform vec3 uCamPos;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWave;

  void main() {
    // Distance to the nearest shore, in UV space. Drives both the depth
    // gradient and the foam below.
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));

    // Shallow at the margins, deep in the middle. Without this a pond is a
    // single flat slab of cyan and reads as coloured glass rather than water —
    // depth is the only cue that tells the player it is a hazard.
    float depth = smoothstep(0.0, 0.26, edge);
    vec3 color = mix(uShallow, uDeep, depth);

    // Wave banding on top, quantised into three flat steps — the "drawn" water
    // look, layered over the gradient rather than replacing it.
    float band = floor((vWave * 0.5 + 0.5) * 3.0) / 3.0;
    color = mix(color, color * 1.22 + uShallow * 0.06, band);

    // Caustics: two noise samples scrolling in opposite directions, thresholded
    // hard so they read as painted highlights rather than a soft texture.
    vec2 uv1 = vWorldPos.xz * 0.12 + vec2(uTime * 0.03, uTime * 0.017);
    vec2 uv2 = vWorldPos.xz * 0.087 - vec2(uTime * 0.021, uTime * 0.035);
    float caustic = texture2D(uNoise, uv1).r * texture2D(uNoise, uv2).r;
    float sparkle = step(0.34, caustic);
    color += uLightColor * sparkle * 0.35;

    // Foam ribbons follow the UV border, so any pond shape gets a shoreline.
    float foamBand = smoothstep(0.055, 0.0, edge);
    float ripple = step(0.5, sin(edge * 90.0 - uTime * 2.4) * 0.5 + 0.5);
    color = mix(color, uFoam, foamBand * (0.55 + ripple * 0.45));

    // Grazing-angle brightening keeps the far side of a pond from going flat.
    vec3 V = normalize(uCamPos - vWorldPos);
    float fres = pow(1.0 - max(V.y, 0.0), 3.0);
    color += uShallow * fres * 0.3;

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export interface WaterOptions {
  width: number;
  depth: number;
  x: number;
  y: number;
  z: number;
}

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(options: WaterOptions, theme: Theme) {
    // Enough tessellation for the vertex waves to read, few enough that a pond
    // costs well under a thousand triangles.
    const segments = Math.max(
      2,
      Math.min(24, Math.round(Math.max(options.width, options.depth) * 1.5)),
    );
    const geometry = new THREE.PlaneGeometry(options.width, options.depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: 0.06 },
        uShallow: { value: new THREE.Color(theme.water) },
        uDeep: { value: new THREE.Color(theme.waterDeep) },
        uFoam: { value: new THREE.Color(theme.foam) },
        uLightColor: { value: new THREE.Color(theme.lightColor) },
        uCamPos: { value: new THREE.Vector3() },
        uNoise: { value: waterNoiseTexture() },
        uOpacity: { value: 0.92 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'water';
    this.mesh.position.set(options.x, options.y, options.z);
    this.mesh.renderOrder = 5;
  }

  update(elapsed: number, cameraPosition: THREE.Vector3): void {
    this.material.uniforms.uTime.value = elapsed;
    (this.material.uniforms.uCamPos.value as THREE.Vector3).copy(cameraPosition);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

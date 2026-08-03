import * as THREE from 'three';
import { rampTexture } from './TextureFactory';
import type { Theme } from './Palette';

/**
 * The single material that shades every solid surface in the game.
 *
 * Why a custom ShaderMaterial rather than MeshToonMaterial: we need control over
 * four separate stylisation terms that Three's built-ins do not combine —
 * quantised wrapped diffuse, a *hard-edged* specular, a Fresnel rim, and a
 * height-tinted hemisphere ambient. Bypassing Three's light rig entirely also
 * means one uniform write per frame instead of per-light uniform blocks, and
 * makes the look completely deterministic across machines.
 *
 * ## Shared uniforms
 * Camera position, time, key light and fog are the *same uniform objects* on
 * every instance. Three uploads them per material, but the game only writes them
 * once per frame — no traversal, no per-material bookkeeping.
 */

export const SharedCelUniforms = {
  uTime: { value: 0 },
  uCamPos: { value: new THREE.Vector3() },
  uLightDir: { value: new THREE.Vector3(0.45, 0.72, 0.53) },
  uLightColor: { value: new THREE.Color(0xfff0dc) },
  uAmbTop: { value: new THREE.Color(0x9dc6ff) },
  uAmbBottom: { value: new THREE.Color(0x6f5a52) },
  uFogColor: { value: new THREE.Color(0xd8e6ff) },
  uFogNear: { value: 42 },
  uFogFar: { value: 190 },
  /** Global wind strength; foliage materials scale their sway by this. */
  uWind: { value: 1 },
};

/** Pushes a theme into the shared uniform block. Call on hole load. */
export function applyThemeToMaterials(theme: Theme): void {
  SharedCelUniforms.uLightDir.value.copy(theme.lightDir).normalize();
  SharedCelUniforms.uLightColor.value.setHex(theme.lightColor);
  SharedCelUniforms.uAmbTop.value.setHex(theme.ambientTop);
  SharedCelUniforms.uAmbBottom.value.setHex(theme.ambientBottom);
  SharedCelUniforms.uFogColor.value.setHex(theme.fogColor);
  SharedCelUniforms.uFogNear.value = theme.fogNear;
  SharedCelUniforms.uFogFar.value = theme.fogFar;
}

export interface CelOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  /** UV multiplier for the map, so one 256px texture tiles across any surface. */
  mapScale?: [number, number];
  emissive?: THREE.ColorRepresentation;
  emissiveStrength?: number;
  rimColor?: THREE.ColorRepresentation;
  rimStrength?: number;
  rimPower?: number;
  /** 0 disables the banded highlight; 1 is a full plastic sheen. */
  specular?: number;
  /** Vertex-shader wind sway amount. 0 for static geometry (the default). */
  sway?: number;
  /** 3 for chunky prop shading, 4 for smoother ground surfaces. */
  bands?: 3 | 4;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
  vertexColors?: boolean;
  /**
   * Set on materials used by an `InstancedMesh` that carries per-instance
   * colours. Explicit because three's own flag does not survive to a
   * ShaderMaterial — see the note in the vertex shader.
   */
  instanceColors?: boolean;
  /** 0 opts a surface out of fog (used by the sky dome and UI-space props). */
  fog?: number;
  /** Extra darkening applied to the shadow band — deepens contact shadows. */
  shadowTint?: number;
  /**
   * Distance, in world units, within which fragments dissolve away from the
   * camera. Used by ground cover so the aim camera can stand in a grass patch
   * without the frame filling with blades. 0 disables it.
   */
  nearFade?: number;
}

const celVertex = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform float uSway;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  // CEL_VCOLOR rather than three's USE_COLOR: as of r180 the *fragment* prefix
  // defines USE_COLOR whenever an InstancedMesh has an instanceColor, but the
  // *vertex* prefix only defines it for material.vertexColors. Guarding a
  // varying on it therefore declares the varying in one stage and not the
  // other, and the program fails to link. This define is set by the material
  // itself, so both stages always agree.
  #ifdef CEL_VCOLOR
    varying vec3 vVertColor;
  #endif

  // CEL_INSTCOLOR rather than three's USE_INSTANCING_COLOR, for the same reason
  // as CEL_VCOLOR above: the two stages must agree on whether the varying
  // exists, and three's flag did not reach both, so the multiply below was
  // silently skipped and every instanced mesh — grass, flowers, rocks, the aim
  // dots — rendered at its material's flat colour. All the per-instance
  // variation in the game was dead, and invisible from JS: reading the instance
  // colours back showed exactly the values intended.
  //
  // The *attribute* is not declared here. Three's vertex prefix already declares
  // instanceColor for an InstancedMesh that has one, and declaring it again is
  // a redefinition that fails to compile — which silently drops the mesh from
  // the frame entirely. Only the varying belongs to us.
  #ifdef CEL_INSTCOLOR
    varying vec3 vInstColor;
  #endif

  void main() {
    vUv = uv;

    #ifdef CEL_VCOLOR
      vVertColor = color;
    #endif
    #ifdef CEL_INSTCOLOR
      vInstColor = instanceColor;
    #endif

    // Fold the instance transform into the model matrix so instanced foliage and
    // unique props run the exact same lighting path below.
    mat4 modelM = modelMatrix;
    #ifdef USE_INSTANCING
      modelM = modelMatrix * instanceMatrix;
    #endif

    vec4 world = modelM * vec4(position, 1.0);

    // Wind sway. Displacement scales with local height so trunks stay planted
    // while canopies move; the world-space phase offset stops a field of
    // instanced grass from waving in lockstep.
    if (uSway > 0.0) {
      float h = max(position.y, 0.0);
      float phase = world.x * 0.55 + world.z * 0.4;
      float amp = uSway * uWind * h;
      world.x += sin(uTime * 1.7 + phase) * amp * 0.09;
      world.z += cos(uTime * 1.31 + phase * 0.8) * amp * 0.07;
    }

    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(modelM) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const celFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform sampler2D uRamp;

  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uAmbTop;
  uniform vec3 uAmbBottom;
  uniform vec3 uCamPos;

  uniform vec3 uRimColor;
  uniform float uRimStrength;
  uniform float uRimPower;
  uniform float uSpecular;
  uniform vec3 uEmissive;
  uniform float uEmissiveStrength;
  uniform float uShadowTint;

  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogAmount;
  uniform float uOpacity;

  #ifdef CEL_MAP
    uniform sampler2D uMap;
    uniform vec2 uMapScale;
  #endif

  #ifdef CEL_NEAR_FADE
    uniform float uNearFade;

    // Ordered dither without an indexed array: bayer2 yields {0, .5, .75, .25}
    // over a 2x2 cell, and nesting it at half scale gives the classic 4x4
    // pattern. An array lookup would need a dynamic index, which is only legal
    // from GLSL ES 3.0 and would tie this material to a WebGL2 context.
    float bayer2(vec2 a) {
      a = floor(a);
      return fract(a.x / 2.0 + a.y * a.y * 0.75);
    }
    float bayer4(vec2 a) {
      return bayer2(a * 0.5) * 0.25 + bayer2(a);
    }
  #endif

  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  #ifdef CEL_VCOLOR
    varying vec3 vVertColor;
  #endif
  #ifdef CEL_INSTCOLOR
    varying vec3 vInstColor;
  #endif

  void main() {
    // Two-sided geometry (leaves, banners) must not shade black from behind.
    // Degenerate transforms (a collapsed instance matrix, a zero-area triangle)
    // can hand this shader a zero-length normal. Normalising that yields NaN,
    // which survives blending and poisons the bloom chain, so guard both
    // normalisations rather than trusting the geometry.
    #ifdef CEL_NEAR_FADE
      // Ground cover is authored where it looks good from a distance, but the
      // aim camera routinely ends up standing in it — and a blade of grass 30 cm
      // from the lens is a wall across the screen. Dissolving anything inside
      // uNearFade keeps the shot clear without the foliage popping out of
      // existence as the camera drifts.
      float camDist = length(uCamPos - vWorldPos);
      if (camDist < uNearFade && bayer4(gl_FragCoord.xy) > camDist / uNearFade) discard;
    #endif

    vec3 N = dot(vNormalW, vNormalW) > 1e-12 ? normalize(vNormalW) : vec3(0.0, 1.0, 0.0);
    if (!gl_FrontFacing) N = -N;

    vec3 toCamera = uCamPos - vWorldPos;
    vec3 V = dot(toCamera, toCamera) > 1e-12 ? normalize(toCamera) : vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(uLightDir);

    // Wrapped diffuse: remapping N·L from [-1,1] to [0,1] rather than clamping
    // keeps the unlit side readable, which is how cel animation handles form
    // shadows. The ramp texture then quantises it into hard bands.
    float ndl = dot(N, L) * 0.5 + 0.5;
    vec3 band = texture2D(uRamp, vec2(clamp(ndl, 0.02, 0.98), 0.5)).rgb;

    vec3 base = uColor;
    #ifdef CEL_VCOLOR
      base *= vVertColor;
    #endif
    #ifdef CEL_INSTCOLOR
      base *= vInstColor;
    #endif
    #ifdef CEL_MAP
      base *= texture2D(uMap, vUv * uMapScale).rgb;
    #endif

    // Hemisphere ambient tinted by surface orientation: up-facing picks up sky,
    // down-facing picks up bounced ground colour.
    vec3 ambient = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);

    // Deepen the darkest band a touch — pure ramp output alone reads flat.
    float shadowMask = 1.0 - smoothstep(0.35, 0.55, ndl);
    ambient *= 1.0 - shadowMask * uShadowTint;

    vec3 color = base * (ambient + uLightColor * band);

    // Hard-edged specular. smoothstep on the Blinn lobe turns a smooth falloff
    // into a discrete highlight shape — the single most "anime" cue after outlines.
    if (uSpecular > 0.0) {
      vec3 H = normalize(L + V);
      float lobe = pow(max(dot(N, H), 0.0), 42.0);
      float spec = smoothstep(0.42, 0.52, lobe);
      color += uLightColor * spec * uSpecular;
    }

    // Fresnel rim, also banded so it reads as painted light rather than a glow.
    float fres = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
    float rim = smoothstep(0.35, 0.72, fres) * uRimStrength;
    color += uRimColor * rim;

    color += uEmissive * uEmissiveStrength;

    float dist = distance(uCamPos, vWorldPos);
    float fog = smoothstep(uFogNear, uFogFar, dist) * uFogAmount;
    color = mix(color, uFogColor, fog);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export class CelMaterial extends THREE.ShaderMaterial {
  constructor(options: CelOptions = {}) {
    const {
      color = 0xffffff,
      map = null,
      mapScale = [1, 1],
      emissive = 0x000000,
      emissiveStrength = 0,
      rimColor = 0xffffff,
      rimStrength = 0.22,
      rimPower = 2.6,
      specular = 0,
      sway = 0,
      bands = 4,
      opacity = 1,
      transparent = false,
      depthWrite = true,
      side = THREE.FrontSide,
      vertexColors = false,
      instanceColors = false,
      fog = 1,
      shadowTint = 0.25,
      nearFade = 0,
    } = options;

    super({
      vertexShader: celVertex,
      fragmentShader: celFragment,
      transparent,
      depthWrite,
      side,
      vertexColors,
      defines: {
        ...(map ? { CEL_MAP: '' } : {}),
        ...(vertexColors ? { CEL_VCOLOR: '' } : {}),
        ...(instanceColors ? { CEL_INSTCOLOR: '' } : {}),
        ...(nearFade > 0 ? { CEL_NEAR_FADE: '' } : {}),
      },
      uniforms: {
        // Per-material state.
        uNearFade: { value: nearFade },
        uColor: { value: new THREE.Color(color) },
        uRamp: { value: rampTexture(bands) },
        uRimColor: { value: new THREE.Color(rimColor) },
        uRimStrength: { value: rimStrength },
        uRimPower: { value: rimPower },
        uSpecular: { value: specular },
        uEmissive: { value: new THREE.Color(emissive) },
        uEmissiveStrength: { value: emissiveStrength },
        uShadowTint: { value: shadowTint },
        uOpacity: { value: opacity },
        uFogAmount: { value: fog },
        uSway: { value: sway },
        uMap: { value: map },
        uMapScale: { value: new THREE.Vector2(mapScale[0], mapScale[1]) },

        // Shared, written once per frame by the renderer.
        ...SharedCelUniforms,
      },
    });

    // Textures owned by the factory cache must not be disposed with the material.
    if (map) map.userData.shared = true;
  }

  get color(): THREE.Color {
    return this.uniforms.uColor.value as THREE.Color;
  }

  setEmissive(color: THREE.ColorRepresentation, strength: number): this {
    (this.uniforms.uEmissive.value as THREE.Color).set(color);
    this.uniforms.uEmissiveStrength.value = strength;
    return this;
  }

  setOpacity(value: number): this {
    this.uniforms.uOpacity.value = value;
    return this;
  }

  /** Applies the theme's rim tint. Called by the builder for every hole surface. */
  setRim(color: THREE.ColorRepresentation, strength: number): this {
    (this.uniforms.uRimColor.value as THREE.Color).set(color);
    this.uniforms.uRimStrength.value = strength;
    return this;
  }

  override clone(): this {
    const clone = super.clone();
    // Re-point the shared uniforms at the originals; ShaderMaterial.clone deep
    // copies them, which would silently detach the clone from per-frame updates.
    for (const key of Object.keys(SharedCelUniforms)) {
      clone.uniforms[key] = SharedCelUniforms[key as keyof typeof SharedCelUniforms];
    }
    return clone;
  }
}

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Final look pass: saturation, contrast, vignette, and the transient screen
 * flash used when the ball is struck or holed.
 *
 * Runs *before* `OutputPass`, so it operates on linear colour. Tone mapping is
 * deliberately left off in the renderer — filmic curves desaturate exactly the
 * punchy primaries this art direction depends on, so a gentle custom shoulder is
 * applied here instead.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.16 },
    uContrast: { value: 1.06 },
    uLift: { value: new THREE.Color(0x000000) },
    uVignette: { value: 0.42 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xffffff) },
    uAberration: { value: 0.0012 },
    uExposure: { value: 1.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uLift;
    uniform float uVignette;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uAberration;
    uniform float uExposure;

    varying vec2 vUv;

    void main() {
      vec2 offset = (vUv - 0.5);
      float radius = length(offset);

      // Chromatic aberration scaled by radius: zero in the centre where the ball
      // lives, subtle at the corners. Enough to suggest a lens, never enough to
      // blur gameplay-critical geometry.
      float shift = uAberration * radius;
      vec3 color;
      color.r = texture2D(tDiffuse, vUv + offset * shift).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - offset * shift).b;

      color *= uExposure;

      // Gentle filmic shoulder — rolls off highlights without the desaturation
      // a full ACES curve would introduce.
      color = color / (1.0 + color * 0.22);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      color += uLift;

      float vig = smoothstep(0.85, 0.25, radius);
      color *= mix(1.0, vig, uVignette);

      color = mix(color, uFlashColor, uFlash);

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

export class GradePass extends ShaderPass {
  constructor() {
    super(GradeShader);
  }

  /** Drives the impact/celebration flash. `amount` decays to 0 in `Juice`. */
  setFlash(amount: number, color: THREE.ColorRepresentation = 0xffffff): void {
    this.uniforms.uFlash.value = amount;
    (this.uniforms.uFlashColor.value as THREE.Color).set(color);
  }

  configure(saturation: number, contrast: number, vignette: number): void {
    this.uniforms.uSaturation.value = saturation;
    this.uniforms.uContrast.value = contrast;
    this.uniforms.uVignette.value = vignette;
  }
}

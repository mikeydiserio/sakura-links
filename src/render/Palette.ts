import * as THREE from 'three';

/**
 * One cohesive palette drives every theme. Colours are authored as sRGB hex and
 * become linear automatically via THREE.ColorManagement, so shaders can work in
 * linear space and let `OutputPass` handle the encode.
 */
export type ThemeId = 'sakura' | 'sky' | 'neon';

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;

  /** Sky gradient stops, bottom → top. */
  skyBottom: number;
  skyMid: number;
  skyTop: number;
  /** Colour of the stylised sun disc and its halo. */
  sunColor: number;
  sunPosition: THREE.Vector3;

  /** Key light. */
  lightColor: number;
  lightDir: THREE.Vector3;
  /** Hemisphere ambient — sky-facing and ground-facing terms. */
  ambientTop: number;
  ambientBottom: number;

  fogColor: number;
  fogNear: number;
  fogFar: number;

  /** Surface colours used by the hole builder. */
  green: number;
  greenAlt: number;
  fairway: number;
  sand: number;
  wall: number;
  wallTop: number;
  accent: number;
  accentAlt: number;
  water: number;
  waterDeep: number;
  foam: number;

  /** Rim light tint applied to every cel material in the theme. */
  rim: number;
  /** Ink colour for both outline systems. */
  ink: number;

  /** Y below which the ball is considered out of play. */
  killY: number;
  /** Bloom strength multiplier — the arcade theme leans much harder on it. */
  bloom: number;
}

const v = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z).normalize();

export const THEMES: Record<ThemeId, Theme> = {
  sakura: {
    id: 'sakura',
    name: 'Sakura Gardens',
    tagline: 'Stone bridges, koi ponds and a very patient wind.',
    skyBottom: 0xffe3ec,
    skyMid: 0xa8d5ff,
    skyTop: 0x4a7ed6,
    sunColor: 0xfff3d0,
    sunPosition: new THREE.Vector3(-90, 60, -140),
    lightColor: 0xfff0dc,
    lightDir: v(0.45, 0.72, 0.53),
    ambientTop: 0x9dc6ff,
    ambientBottom: 0x6f5a52,
    fogColor: 0xd8e6ff,
    fogNear: 66,
    fogFar: 240,
    green: 0x4e9c53,
    greenAlt: 0x3d8244,
    fairway: 0x63b163,
    sand: 0xdfc386,
    wall: 0x9e8a6e,
    wallTop: 0xb9a684,
    accent: 0xff9ec4,
    accentAlt: 0xe4557f,
    water: 0x5fc7e8,
    waterDeep: 0x1e6fa8,
    foam: 0xffffff,
    rim: 0xffd7e6,
    ink: 0x2a1f2b,
    killY: -14,
    bloom: 0.55,
  },

  sky: {
    id: 'sky',
    name: 'Sky Islands',
    tagline: 'Mind the gap. There is a great deal of it.',
    // The player spends this course looking *down*, so the frame is almost all
    // horizon band — a warm cream here filled the screen with sand colour and
    // read as desert rather than altitude.
    skyBottom: 0xdaeef8,
    skyMid: 0x7fd4f7,
    skyTop: 0x2a5fc0,
    sunColor: 0xfff8e0,
    sunPosition: new THREE.Vector3(110, 70, -120),
    lightColor: 0xfff6e2,
    lightDir: v(-0.4, 0.76, 0.5),
    ambientTop: 0xbfe4ff,
    ambientBottom: 0x7d8fa8,
    fogColor: 0xdff2ff,
    fogNear: 55,
    fogFar: 260,
    green: 0x53ab7f,
    greenAlt: 0x429169,
    fairway: 0x6cc194,
    sand: 0xe2cd97,
    // Mid blue-grey, not the near-white this used to be. Against a pale sky and
    // a white cloud sea, white rails left the whole course without a mid tone
    // and the geometry stopped reading at all.
    wall: 0x9db8d2,
    wallTop: 0xc6dcee,
    accent: 0x8fd9ff,
    accentAlt: 0x4f8fe8,
    water: 0x7ad9f0,
    waterDeep: 0x2f7fbe,
    foam: 0xffffff,
    rim: 0xd8f2ff,
    ink: 0x22304a,
    killY: -40,
    bloom: 0.7,
  },

  neon: {
    id: 'neon',
    name: 'Neon Arcade',
    tagline: 'Insert coin. Do not feed the bumpers.',
    skyBottom: 0x2a0f4a,
    skyMid: 0x160a33,
    skyTop: 0x070417,
    sunColor: 0xff5fd2,
    sunPosition: new THREE.Vector3(0, 46, -160),
    lightColor: 0xd6c2ff,
    lightDir: v(0.3, 0.8, 0.5),
    ambientTop: 0x4b3a8f,
    ambientBottom: 0x1a1035,
    fogColor: 0x1a0f38,
    fogNear: 40,
    fogFar: 175,
    green: 0x1f6e56,
    greenAlt: 0x175a46,
    fairway: 0x268066,
    sand: 0xa385d6,
    wall: 0x1e1838,
    wallTop: 0x342a5c,
    accent: 0x2ff5e0,
    accentAlt: 0xff3ea5,
    water: 0x9b3cff,
    waterDeep: 0x4a1290,
    foam: 0xd8b4ff,
    rim: 0x8ef7ff,
    ink: 0x0a0618,
    killY: -18,
    bloom: 1.35,
  },
};

export const THEME_ORDER: ThemeId[] = ['sakura', 'sky', 'neon'];

/** Convenience: a THREE.Color for a palette entry (already linear). */
export const col = (hex: number): THREE.Color => new THREE.Color(hex);

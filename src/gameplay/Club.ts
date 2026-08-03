import * as THREE from 'three';
import { CelMaterial } from '../render/CelMaterial';
import { addOutline } from '../render/OutlineMaterial';
import { mergeGeometries } from '../world/Environment';
import { clamp01, easeInCubic, easeOutCubic, easeOutBack, damp } from '../util/math';
import type { Theme } from '../render/Palette';

/**
 * The putter, and the swing animation that gives a stroke weight.
 *
 * ### Anatomy
 * Modelled as a blade putter, against actual putter fitting specs rather
 * than a stylised guess:
 *
 * | Feature       | Real-world spec                          | Source-backed range |
 * |---------------|-------------------------------------------|----------------------|
 * | Loft          | 2–4°, most commonly ~3.5° (Scotty Cameron standard) | not 0° — a flat-vertical face is the most common modelling mistake |
 * | Lie angle     | 70–72° off most off-the-rack putters       | shaft leans ~20° from vertical toward the player, never plumb |
 * | Shaft length  | 33–35", most commonly fitted at 34"        | measured heel-to-butt along the shaft axis |
 * | Head (blade)  | ~4.5" (114 mm) heel-toe × 1.0" (25 mm) tall | the head built here is 132 × 26 mm — close to this |
 * | Grip          | flat-fronted, non-circular cross-section (USGA Equipment Rules 2019, Part 2 Rule 4 — the flat must reach within 1" of both ends); ~1" (25 mm) diameter | promotes consistent thumb placement, unlike a round club grip |
 * | Offset        | shaft set back of the face by roughly a half-to-full shaft width, entering near the heel through a hosel/neck rather than dead centre | "the shaft leads the face" |
 *
 * ### World scale
 * `BALL_RADIUS` (Ball.ts) is 0.18 units for a real 21.3 mm ball radius, which
 * read literally is ~118 mm/unit. But this file's shaft+grip length already
 * totalled ~3.0 units before this rework, and 3.0 units for a 34" (863.6 mm)
 * putter — the most commonly fitted length — implies **288 mm/unit** instead.
 * That factor is what every dimension below is built from. Re-deriving the
 * ball at 288 mm/unit gives a ~104 mm diameter, about 2.4× a real ball —
 * which matches, rather than fights, this game's deliberate arcade oversizing
 * of the ball for readability. Ball-scale and course-scale already imply two
 * different meters-per-unit constants in this game (there is no single one
 * that reconciles a 0.18-unit ball with 21-unit holes); the putter is built
 * to look right against both the ball and the rails, which is the real
 * constraint, rather than against an arithmetic ideal neither other system
 * actually honours.
 *
 * ### Animation model
 * A four-stage state machine driven by a single normalised clock:
 *
 * | Stage      | Behaviour                                                    |
 * |------------|--------------------------------------------------------------|
 * | `idle`     | Head hovers behind the ball, breathing gently                |
 * | `charging` | Draws back proportional to charge, with anticipation lag     |
 * | `swinging` | Snaps forward through the ball on an ease-in curve           |
 * | `follow`   | Overshoots past the ball, then eases back with `easeOutBack` |
 *
 * Impact is timer-driven (`SWING_DURATION`), not a geometric collision test —
 * the head's origin stays anchored close to the pivot throughout, so the
 * lie-angle tilt and hosel offset added below are purely cosmetic dressing on
 * the existing pivot and do not change when or where contact registers.
 *
 * ### Ground clearance
 * The head follows an arc whose lowest point is exactly at ball height. The
 * shaft angle is derived from that arc rather than animated independently, so
 * there is no configuration in which the head can pass below the surface.
 */
type SwingStage = 'idle' | 'charging' | 'swinging' | 'follow';

const BACKSWING_MAX = 1.15;
const SWING_DURATION = 0.13;
const FOLLOW_DURATION = 0.42;

// Real putters carry 2–4° of loft (Scotty Cameron's standard is 3.5°) — a
// dead-vertical face is the single most common modelling mistake.
const LOFT = THREE.MathUtils.degToRad(3);
// 70° lie angle off the ground == 20° off vertical. The shaft (and, below,
// the hosel that continues its line down to the head) leans toward the
// player — away from the target — it is never plumb at address.
const LIE_TILT = THREE.MathUtils.degToRad(-20);

/**
 * Half-round "flat front" grip cross-section. Real pistol-grip putter grips
 * are explicitly non-circular (USGA Equipment Rules 2019, Part 2 Rule 4: the
 * flat front must extend to within 1" of both ends) so a golfer can seat both
 * thumbs side by side. A true pistol grip uses a shallow flat chord; this
 * simplifies to a full semicircle (flat diameter + round back), which is
 * trivial to build without degenerate geometry and still reads unmistakably
 * as "not round" at cel-shaded viewing distance.
 */
function gripCrossSection(radius: number, segments = 10): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(radius, 0);
  shape.lineTo(-radius, 0);
  for (let i = 1; i <= segments; i++) {
    const angle = Math.PI + (i / segments) * Math.PI;
    shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return shape;
}

export class Club {
  readonly group = new THREE.Group();

  /** Fired at the exact frame the head meets the ball. */
  onImpact?: () => void;

  private readonly pivot = new THREE.Group();
  private stage: SwingStage = 'idle';
  private timer = 0;
  private charge = 0;
  private displayedCharge = 0;
  private breathe = 0;
  /**
   * Once the swing is released the club stops tracking the ball. The ball leaves
   * at the moment of release, so continuing to follow it would drag the putter
   * across the course like a tow rope.
   */
  private anchored = false;

  constructor(theme: Theme) {
    this.group.name = 'club';
    this.group.add(this.pivot);

    const shaftMaterial = new CelMaterial({
      color: 0xdfe4ec,
      bands: 3,
      specular: 0.6,
      rimColor: theme.rim,
      rimStrength: 0.45,
    });

    const gripMaterial = new CelMaterial({
      color: 0x2c2a35,
      bands: 3,
      rimColor: theme.rim,
      rimStrength: 0.3,
    });

    const headMaterial = new CelMaterial({
      color: 0xf0f3f8,
      bands: 3,
      specular: 0.75,
      rimColor: 0xffffff,
      rimStrength: 0.6,
    });

    // A milled/insert face reads as a distinct material from the body, which
    // sells "this is a flat striking face" far better than one uniform tone.
    const faceMaterial = new CelMaterial({
      color: 0x81868f,
      bands: 3,
      specular: 0.4,
      rimColor: theme.rim,
      rimStrength: 0.2,
    });

    // --- Head: blade built from two stacked, visually distinct volumes ---
    // A single beveled box reads as a plain brick once outlined — real blades
    // read as a shape because the sole (wide, flat, full depth) and the top
    // rail/spine (narrower, sitting toward the face, leaving the sole's back
    // edge exposed as a step) are two different volumes with a real seam
    // between them. That seam is exactly what the outline pass and the
    // screen-space Sobel edge pick out, so it is built as two boxes rather
    // than one.
    //
    // 0.46 x 0.09 x 0.15 units heel-toe x tall x deep == 132 x 26 x 43 mm at
    // 288 mm/unit — a blade-accurate footprint (real blade: 114 x 25 mm) and
    // roughly half the ball's radius (0.18u) tall, not a full ball.
    const HEAD_LENGTH = 0.46;
    const HEAD_HEIGHT = 0.09;
    const HEAD_DEPTH = 0.15;
    const SOLE_HEIGHT = 0.024;
    const RAIL_HEIGHT = HEAD_HEIGHT - SOLE_HEIGHT;
    const RAIL_DEPTH = HEAD_DEPTH * 0.6;
    const RAIL_LENGTH = HEAD_LENGTH * 0.92;
    // The rail sits flush with the sole's front (face) edge, so the sole's
    // back portion is left exposed as a visible rearward step.
    const RAIL_Z = -HEAD_DEPTH / 2 + RAIL_DEPTH / 2;
    const CAP_RADIUS = RAIL_HEIGHT * 0.66;
    const HEEL_X = -(RAIL_LENGTH / 2 - CAP_RADIUS);

    const headParts: THREE.BufferGeometry[] = [];
    const sole = new THREE.BoxGeometry(HEAD_LENGTH, SOLE_HEIGHT, HEAD_DEPTH);
    sole.translate(0, SOLE_HEIGHT / 2, 0);
    headParts.push(sole);
    const rail = new THREE.BoxGeometry(RAIL_LENGTH, RAIL_HEIGHT, RAIL_DEPTH);
    rail.translate(0, SOLE_HEIGHT + RAIL_HEIGHT / 2, RAIL_Z);
    headParts.push(rail);
    // Rounded heel/toe caps protrude past the rail's own height, so each end
    // reads as a distinct rounded bump rather than a squared-off corner.
    const heel = new THREE.CylinderGeometry(CAP_RADIUS, CAP_RADIUS, RAIL_DEPTH, 8);
    heel.rotateX(Math.PI / 2);
    heel.translate(HEEL_X, SOLE_HEIGHT + RAIL_HEIGHT / 2, RAIL_Z);
    headParts.push(heel);
    const toe = heel.clone();
    toe.translate(-HEEL_X * 2, 0, 0);
    headParts.push(toe);

    const headBody = new THREE.Mesh(mergeGeometries(headParts), headMaterial);
    headParts.forEach((g) => g.dispose());
    addOutline(headBody, { color: theme.ink, pixels: 2.4 });

    // Flat, slightly lofted striking face on the rail's front — a distinct
    // material/volume, not a texture, so it survives the cel + outline look.
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_LENGTH * 0.92, RAIL_HEIGHT * 0.82, 0.018),
      faceMaterial,
    );
    face.position.set(0, SOLE_HEIGHT + RAIL_HEIGHT / 2, RAIL_Z - RAIL_DEPTH / 2 - 0.009);

    // Sightline: wider and brighter than before so it holds contrast against
    // the crown at gameplay camera distance, not just close up.
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.01, RAIL_DEPTH * 0.72),
      new CelMaterial({
        color: theme.accentAlt,
        emissive: theme.accentAlt,
        emissiveStrength: 0.8,
        bands: 3,
        rimStrength: 0,
      }),
    );
    sight.position.set(0, HEAD_HEIGHT + 0.006, RAIL_Z);

    // The head group only carries the loft tilt — never the lie angle — so
    // its origin (near the sole, at pivot-local y=0) stays exactly where the
    // swing state machine already expects it for timing purposes.
    const headGroup = new THREE.Group();
    headGroup.add(headBody, face, sight);
    headGroup.rotation.x = LOFT;
    this.pivot.add(headGroup);

    // --- Shaft assembly: hosel + shaft + grip, one rigid tilted unit -----
    // The previous version computed the hosel as a strut between two points
    // defined in two *different* rotated frames (head vs. shaft), which left
    // it short, thin and only approximately aligned with the shaft above it —
    // easy for the shaft to visually read as passing straight through the
    // head. Building the hosel as a child of the same tilted `shaftGroup` as
    // the shaft removes that seam entirely: hosel, shaft and grip are one
    // unbroken, contiguously-stacked line, all sharing `LIE_TILT`, and the
    // shaft's own geometry starts exactly at local y=0 (the top of the
    // hosel) — it never extends down into the head volume.
    //
    // `shaftBase` is solved so that the hosel's *head-end* (local y=-HOSEL_
    // LENGTH within shaftGroup, after the group's own tilt) lands exactly on
    // the rail's crown at the heel — flush, not embedded and not gapped.
    const SHAFT_LENGTH = 1.95;
    const GRIP_LENGTH = 0.85;
    const GRIP_RADIUS = 0.045;
    const HOSEL_LENGTH = 0.17; // ~49 mm at scale — within the real 40-70 mm hosel range
    const cosLie = Math.cos(-LIE_TILT);
    const sinLie = Math.sin(-LIE_TILT);
    const headTopHeel = new THREE.Vector3(HEEL_X, HEAD_HEIGHT, RAIL_Z);
    const shaftBase = new THREE.Vector3(
      HEEL_X,
      headTopHeel.y + HOSEL_LENGTH * cosLie,
      headTopHeel.z - HOSEL_LENGTH * sinLie,
    );

    const shaftGroup = new THREE.Group();
    shaftGroup.position.copy(shaftBase);
    shaftGroup.rotation.x = LIE_TILT;
    this.pivot.add(shaftGroup);

    // Chunky, visibly tapered neck: thick where it meets the head (~10 mm
    // radius), narrowing to meet the shaft's own tip radius.
    const hosel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.036, HOSEL_LENGTH, 8),
      shaftMaterial,
    );
    hosel.position.y = -HOSEL_LENGTH / 2;
    shaftGroup.add(hosel);
    addOutline(hosel, { color: theme.ink, pixels: 2 });

    // Tapered shaft: thinner at the tip (hosel end, ~0.016u == 4.6 mm radius)
    // than at the butt (grip end, ~0.024u == 6.9 mm radius) — real steel
    // putter shafts taper from a ~9.5 mm tip OD toward a wider butt. Starts
    // at local y=0, exactly the top of the hosel above — it does not reach
    // down toward the head.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.016, SHAFT_LENGTH, 8),
      shaftMaterial,
    );
    shaft.position.y = SHAFT_LENGTH / 2;
    shaftGroup.add(shaft);
    addOutline(shaft, { color: theme.ink, pixels: 2 });

    // Flat-fronted grip, clearly thicker than the shaft and built from the
    // non-circular cross-section above rather than a plain cylinder. Its
    // length (0.85u) is deliberately shorter than the shaft (real putter
    // grips run ~25-30% of total length) — matching real proportions, not a
    // literal "grip longer than shaft" reading.
    const gripGeometry = new THREE.ExtrudeGeometry(gripCrossSection(GRIP_RADIUS), {
      depth: GRIP_LENGTH,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 1,
      curveSegments: 1,
    });
    // The extrude's depth axis becomes the vertical (grip-length) axis; the
    // flat front then sits at local z=0, bulging round toward +z, so recentre
    // it across the shaft's own z=0 axis.
    gripGeometry.rotateX(-Math.PI / 2);
    gripGeometry.translate(0, 0, -GRIP_RADIUS / 2);
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.y = SHAFT_LENGTH;
    shaftGroup.add(grip);
    addOutline(grip, { color: theme.ink, pixels: 2 });

    this.visible = false;
  }

  set visible(value: boolean) {
    this.group.visible = value;
    // Showing the club again always means a new address position is wanted.
    if (value) this.anchored = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  get isSwinging(): boolean {
    return this.stage === 'swinging' || this.stage === 'follow';
  }

  /**
   * Places the club at the ball, facing along the aim direction.
   * Ignored once a swing is under way — see `anchored`.
   */
  place(ballPosition: THREE.Vector3, aimYaw: number): void {
    if (this.anchored) return;
    // Address the ball from *behind* it along the aim line. Sitting the head at
    // the ball's own position buries the ball inside the mallet; backing off by
    // roughly a ball radius plus half the head depth reads as a proper stance,
    // and the downswing then carries the head through the ball.
    const standoff = 0.34;
    this.group.position.set(
      ballPosition.x - Math.sin(aimYaw) * standoff,
      ballPosition.y - 0.18,
      ballPosition.z - Math.cos(aimYaw) * standoff,
    );
    this.group.rotation.y = aimYaw;
  }

  setCharge(charge: number): void {
    this.charge = clamp01(charge);
    if (this.stage === 'idle' && this.charge > 0.001) this.stage = 'charging';
  }

  release(): void {
    if (this.stage === 'swinging' || this.stage === 'follow') return;
    this.stage = 'swinging';
    this.timer = 0;
    // Freeze at the address position for the duration of the downswing.
    this.anchored = true;
  }

  cancel(): void {
    this.stage = 'idle';
    this.charge = 0;
    this.timer = 0;
    this.anchored = false;
  }

  update(dt: number, elapsed: number): void {
    this.breathe = elapsed;

    switch (this.stage) {
      case 'charging':
        // Anticipation: the displayed draw lags the input, so the club looks
        // like it has mass rather than snapping to the meter.
        this.displayedCharge = damp(this.displayedCharge, this.charge, 11, dt);
        break;

      case 'swinging':
        this.timer += dt;
        if (this.timer >= SWING_DURATION) {
          // Contact. The club has done its job — hide it so it does not trail
          // the ball down the fairway, and let the ball carry the shot.
          this.stage = 'follow';
          this.timer = 0;
          this.group.visible = false;
          this.onImpact?.();
        }
        break;

      case 'follow':
        this.timer += dt;
        if (this.timer >= FOLLOW_DURATION) {
          this.stage = 'idle';
          this.charge = 0;
          this.displayedCharge = 0;
          this.timer = 0;
          // `anchored` deliberately stays set: the club is hidden at this point
          // and only re-addresses the ball when it is shown again.
        }
        break;

      default:
        this.displayedCharge = damp(this.displayedCharge, 0, 8, dt);
        break;
    }

    this.pivot.rotation.x = this.currentAngle();
    // A subtle idle sway keeps the pre-shot pose from looking frozen.
    if (this.stage === 'idle' || this.stage === 'charging') {
      this.pivot.rotation.z = Math.sin(this.breathe * 1.6) * 0.018;
      this.pivot.position.y = Math.sin(this.breathe * 1.2) * 0.006;
    } else {
      this.pivot.rotation.z = damp(this.pivot.rotation.z, 0, 14, dt);
      this.pivot.position.y = damp(this.pivot.position.y, 0, 14, dt);
    }
  }

  /**
   * Swing angle in radians about the club's pivot.
   * Positive rotates the head *backwards* (away from the target).
   */
  private currentAngle(): number {
    const draw = this.displayedCharge * BACKSWING_MAX;

    switch (this.stage) {
      case 'charging':
        return draw;

      case 'swinging': {
        // Ease-in: slow off the top, fastest at impact. The extra 0.18 rad
        // carries the head just past the ball so contact reads as a strike.
        const t = clamp01(this.timer / SWING_DURATION);
        return draw - easeInCubic(t) * (draw + 0.18);
      }

      case 'follow': {
        const t = clamp01(this.timer / FOLLOW_DURATION);
        // Overshoot through the follow-through, then settle with a small
        // bounce — easeOutBack gives the recoil for free.
        const peak = -0.18 - (1 - easeOutCubic(Math.min(1, t * 2.6))) * 0.75;
        return peak * (1 - easeOutBack(t));
      }

      default:
        return 0;
    }
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!object.userData.outline) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material;
      if (material) material.dispose();
    });
    this.group.parent?.remove(this.group);
  }
}

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Ball, BALL_RADIUS } from './Ball';
import { Club } from './Club';
import { AimSystem } from './AimSystem';
import { CameraRig } from './CameraRig';
import { HoleBuilder } from '../course/HoleBuilder';
import type { BuiltHole } from '../course/HoleBuilder';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ParticleSystem } from '../fx/ParticleSystem';
import type { Juice } from '../fx/Juice';
import { Trail } from '../fx/Trail';
import { Emitter } from '../core/Events';
import type { GameEvents, ImpactKind } from '../core/Events';
import { clamp01, damp, easeOutCubic } from '../util/math';
import type { Theme } from '../render/Palette';
import type { HoleDef } from '../course/types';
import type { Input } from '../core/Input';
import type { BallSnapshot, MatchSnapshot, RoomPlayer } from '../multiplayer/RoomSync';

/**
 * Owns everything about *playing a single hole*: the turn loop, hazards, the
 * win condition, and the wiring between physics events and presentation.
 *
 * ### The turn loop
 * ```
 * aiming ──(release)──► rolling ──(at rest)──► aiming
 *              │                     │
 *              │                     ├──(in cup)──► sinking ──► complete
 *              │                     └──(hazard)──► penalty ──► aiming
 * ```
 * `aiming` is the only state that accepts input. Every transition out of
 * `rolling` restores control exactly once, which is what keeps the stroke count
 * honest even when a ball is holed and drowned on the same frame.
 */
export type PlayState = 'intro' | 'aiming' | 'charging' | 'rolling' | 'sinking' | 'complete';

export interface HoleResult {
  strokes: number;
  par: number;
}

interface MultiplayerBallState {
  id: string;
  name: string;
  color: string;
  ball: Ball;
  strokes: number;
  holed: boolean;
}

/** Distance a rolling ball must travel before its resting spot is trusted. */
const SAFE_SAMPLE_INTERVAL = 0.25;

/**
 * Hard cap on a single stroke. A ball wedged against geometry, orbiting a
 * rotator or bouncing between two bumpers must not hang the turn. Twelve
 * seconds is well past any legitimate shot — the longest hole is under twenty
 * units end to end, which a full-power putt crosses in about three.
 */
const STROKE_TIMEOUT = 12;

export class HoleRuntime {
  readonly group = new THREE.Group();
  readonly events = new Emitter<GameEvents>();

  state: PlayState = 'intro';
  strokes = 0;
  elapsedOnHole = 0;

  private ball: Ball;
  private readonly soloBall: Ball;
  private readonly club: Club;
  private readonly aim: AimSystem;
  private readonly trail: Trail;
  private built: BuiltHole | null = null;
  private hole: HoleDef | null = null;

  private introTimer = 0;
  /** Blocks charging until the pointer is released — see `beginPlay`. */
  private swallowPointerUntilRelease = false;
  private sinkTimer = 0;
  private restDelay = 0;
  private safeTimer = 0;
  private readonly safePosition = new THREE.Vector3();
  private readonly sinkStart = new THREE.Vector3();
  private cameraYawOffset = 0;
  private freeOrbiting = false;
  private lastCollisionTime = 0;
  private rollTime = 0;

  private readonly tmp = new THREE.Vector3();
  private readonly contactNormal = new THREE.Vector3();
  private readonly collisionHandlers = new Map<Ball, (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => void>();
  private multiplayerPlayers = new Map<string, MultiplayerBallState>();
  private multiplayerOrder: string[] = [];
  private activePlayerId: string | null = null;
  private multiplayerEnabled = false;
  private multiplayerWinnerId: string | null = null;
  private remoteReplicaMode = false;
  /** Latest host states. Guests interpolate toward these without stepping physics. */
  private readonly remoteTargets = new Map<string, BallSnapshot>();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly camera: CameraRig,
    private readonly particles: ParticleSystem,
    private readonly juice: Juice,
    private theme: Theme,
  ) {
    this.group.name = 'hole-runtime';

    this.soloBall = new Ball(physics, theme);
    this.ball = this.soloBall;
    this.club = new Club(theme);
    this.registerBall(this.ball);
    this.aim = new AimSystem(physics, theme);
    this.trail = new Trail(theme.accent);

    this.group.add(this.ball.group, this.ball.shadowMesh, this.club.group, this.aim.group, this.trail.mesh);
  }

  get ballPosition(): THREE.Vector3 {
    return this.ball.position;
  }

  get charge(): number {
    return this.aim.charge;
  }

  get par(): number {
    return this.hole?.par ?? 3;
  }

  get holeDefinition(): HoleDef | null {
    return this.hole;
  }

  get surface(): string {
    return this.ball.surface;
  }

  get ballSpeed(): number {
    return this.ball.speed;
  }

  get activePlayerIdValue(): string | null {
    return this.activePlayerId;
  }

  get multiplayerState(): ReadonlyArray<MultiplayerBallState> {
    return this.multiplayerOrder.map((id) => this.multiplayerPlayers.get(id)).filter(Boolean) as MultiplayerBallState[];
  }

  get ballGrounded(): boolean {
    return this.ball.grounded;
  }

  get waterCoverage(): number {
    return this.built ? clamp01(this.built.hazards.length * 0.6) : 0;
  }

  setMultiplayerPlayers(players: RoomPlayer[]): void {
    const previousPlayers = this.multiplayerPlayers;
    this.multiplayerEnabled = players.length > 0;
    this.multiplayerPlayers = new Map();
    this.multiplayerOrder = [];

    const nextPlayerIds = new Set(players.map((player) => player.id));
    for (const [playerId, state] of previousPlayers) {
      if (!nextPlayerIds.has(playerId)) this.disposeMultiplayerBall(state.ball);
    }

    this.soloBall.visible = !this.multiplayerEnabled;
    this.soloBall.body.collisionResponse = !this.multiplayerEnabled;
    this.soloBall.body.type = this.multiplayerEnabled ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
    this.soloBall.body.updateMassProperties();

    players.forEach((player) => {
      const existing = previousPlayers.get(player.id);
      const ball = existing?.ball ?? new Ball(this.physics, this.theme, player.color);
      if (!existing) {
        this.group.add(ball.group, ball.shadowMesh);
        this.registerBall(ball);
      }
      ball.setColor(player.color);
      const state: MultiplayerBallState = {
        id: player.id,
        name: player.name,
        color: player.color,
        ball,
        strokes: existing?.strokes ?? 0,
        holed: existing?.holed ?? false,
      };
      this.multiplayerPlayers.set(player.id, state);
      this.multiplayerOrder.push(player.id);
    });

    this.multiplayerWinnerId = null;
    if (!this.multiplayerEnabled) {
      this.activePlayerId = null;
      this.ball = this.soloBall;
      this.remoteTargets.clear();
      this.remoteReplicaMode = false;
      return;
    }
    if (this.activePlayerId === null || !this.multiplayerPlayers.has(this.activePlayerId)) {
      this.activePlayerId = this.multiplayerOrder[0] ?? null;
    }
    if (this.activePlayerId) {
      this.ball = this.multiplayerPlayers.get(this.activePlayerId)?.ball ?? this.ball;
    }
  }

  setActiveMultiplayerPlayer(playerId: string | null, emitChange = true): void {
    const previousId = this.activePlayerId;
    if (!playerId || !this.multiplayerPlayers.has(playerId)) {
      this.activePlayerId = this.multiplayerOrder[0] ?? null;
    } else {
      this.activePlayerId = playerId;
    }
    this.ball = this.activePlayerId ? this.multiplayerPlayers.get(this.activePlayerId)?.ball ?? this.ball : this.ball;
    if (emitChange && previousId !== this.activePlayerId) {
      this.events.emit('multiplayerTurnChanged', { playerId: this.activePlayerId });
    }
  }

  captureMultiplayerSnapshot(
    sequence: number,
    matchTime: number,
    holeIndex: number,
  ): MatchSnapshot {
    const balls = this.multiplayerOrder.flatMap((playerId) => {
      const player = this.multiplayerPlayers.get(playerId);
      if (!player) return [];
      const body = player.ball.body;
      return [{
        playerId,
        position: [body.position.x, body.position.y, body.position.z] as [number, number, number],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] as [number, number, number, number],
        velocity: [body.velocity.x, body.velocity.y, body.velocity.z] as [number, number, number],
        angularVelocity: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z] as [number, number, number],
        strokes: player.strokes,
        holed: player.holed,
        visible: player.ball.visible,
      }];
    });

    return {
      kind: 'state-snapshot',
      sequence,
      matchTime,
      holeIndex,
      playState: this.state,
      activePlayerId: this.activePlayerId,
      winnerPlayerId: this.multiplayerWinnerId,
      aimYaw: this.aim.yaw,
      balls,
    };
  }

  /** Applies host-owned match metadata and queues smooth visual correction. */
  applyMultiplayerSnapshot(snapshot: MatchSnapshot): void {
    this.state = snapshot.playState;
    this.multiplayerWinnerId = snapshot.winnerPlayerId;
    this.aim.yaw = snapshot.aimYaw;
    this.setActiveMultiplayerPlayer(snapshot.activePlayerId, false);

    for (const target of snapshot.balls) {
      const player = this.multiplayerPlayers.get(target.playerId);
      if (!player) continue;
      const body = player.ball.body;
      const hadTarget = this.remoteTargets.has(target.playerId);
      const dx = target.position[0] - body.position.x;
      const dy = target.position[1] - body.position.y;
      const dz = target.position[2] - body.position.z;
      if (!hadTarget || dx * dx + dy * dy + dz * dz > 16) {
        body.position.set(...target.position);
      }
      player.strokes = target.strokes;
      player.holed = target.holed;
      player.ball.visible = target.visible;
      this.remoteTargets.set(target.playerId, target);
    }

    const active = this.activePlayerId ? this.multiplayerPlayers.get(this.activePlayerId) : null;
    if (active) {
      this.ball = active.ball;
      this.strokes = active.strokes;
    }
    const canAim = this.state === 'aiming' || this.state === 'charging';
    this.aim.visible = canAim;
    this.club.visible = canAim;
  }

  /** Tears down the previous hole and constructs the next one. */
  load(hole: HoleDef, theme: Theme): void {
    this.unloadHole();
    this.remoteTargets.clear();

    this.theme = theme;
    this.hole = hole;
    this.strokes = 0;
    this.multiplayerWinnerId = null;
    this.elapsedOnHole = 0;
    this.introTimer = 0;
    this.sinkTimer = 0;
    this.restDelay = 0;
    this.rollTime = 0;
    this.cameraYawOffset = 0;

    const builder = new HoleBuilder(this.physics, theme);
    this.built = builder.build(hole);
    this.group.add(this.built.group);

    // Warm up the physics world before anything touches it.
    //
    // cannon's sweep-and-prune broadphase only refreshes body AABBs during a
    // step, so immediately after a hole is built every raycast misses and the
    // first frame generates no collision pairs at all — the ball is briefly in
    // a world with no floor. Everything that runs before the first real step
    // (surface probing for grounding, the aim preview, the ball's shadow) reads
    // an empty world without this.
    this.physics.step(1 / 120);

    const teeY = hole.tee.y + BALL_RADIUS + 0.02;
    if (this.multiplayerEnabled && this.multiplayerOrder.length > 0) {
      const offsets = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.3, 0, -0.18),
        new THREE.Vector3(-0.3, 0, -0.18),
        new THREE.Vector3(0.15, 0, 0.3),
      ];
      this.multiplayerOrder.forEach((id, index) => {
        const state = this.multiplayerPlayers.get(id);
        if (!state) return;
        const offset = offsets[Math.min(index, offsets.length - 1)];
        state.strokes = 0;
        state.holed = false;
        state.ball.reset(hole.tee.x + offset.x, teeY, hole.tee.z + offset.z);
        state.ball.visible = true;
      });
      const active = this.multiplayerPlayers.get(this.activePlayerId ?? this.multiplayerOrder[0] ?? '');
      if (active) {
        this.ball = active.ball;
        this.safePosition.set(this.ball.position.x, this.ball.position.y, this.ball.position.z);
      }
    } else {
      this.ball.reset(hole.tee.x, teeY, hole.tee.z);
    }
    this.safePosition.set(hole.tee.x, teeY, hole.tee.z);
    this.trail.setColor(theme.accent);
    this.trail.clear();

    const cup = this.built.cupPosition;
    this.aim.faceTarget(this.ball.position, cup);
    if (hole.aim !== undefined) this.aim.yaw = hole.aim;
    this.camera.setCupTarget(cup);
    this.camera.faceTarget(this.ball.position, cup);
    this.camera.setOccluders(this.built.occluders);
    this.camera.resetZoom();
    this.camera.snapTo(this.ball.position);
    this.camera.setMode('intro');

    this.aim.visible = false;
    this.club.visible = false;
    this.state = 'intro';
  }

  /** Skips the establishing shot and hands control to the player. */
  beginPlay(): void {
    if (this.state !== 'intro') return;
    this.state = 'aiming';
    // See the note in handleInput: a click that skips the intro must not carry
    // through into the first swing.
    this.swallowPointerUntilRelease = true;
    this.camera.setMode('aim');
    this.camera.faceTarget(this.ball.position, this.built?.cupPosition ?? this.ball.position);
    this.aim.visible = true;
    this.club.visible = true;
  }

  restart(): void {
    if (!this.hole || this.state === 'complete') return;
    // Captured so the narrowing survives into the callback below.
    const hole = this.hole;
    const teeY = hole.tee.y + BALL_RADIUS + 0.02;
    if (this.multiplayerEnabled && this.multiplayerOrder.length > 0) {
      const offsets = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.3, 0, -0.18),
        new THREE.Vector3(-0.3, 0, -0.18),
        new THREE.Vector3(0.15, 0, 0.3),
      ];
      this.multiplayerOrder.forEach((id, index) => {
        const state = this.multiplayerPlayers.get(id);
        if (!state) return;
        const offset = offsets[Math.min(index, offsets.length - 1)];
        state.strokes = 0;
        state.holed = false;
        state.ball.reset(hole.tee.x + offset.x, teeY, hole.tee.z + offset.z);
        state.ball.visible = true;
      });
      const active = this.multiplayerPlayers.get(this.activePlayerId ?? this.multiplayerOrder[0] ?? '');
      if (active) {
        this.ball = active.ball;
        this.safePosition.set(this.ball.position.x, this.ball.position.y, this.ball.position.z);
      }
    } else {
      this.ball.reset(this.hole.tee.x, teeY, this.hole.tee.z);
      this.safePosition.set(this.hole.tee.x, teeY, this.hole.tee.z);
    }
    this.trail.clear();
    this.aim.cancelCharge();
    this.club.cancel();
    this.state = 'aiming';
    this.camera.setMode('aim');
    this.aim.visible = true;
    this.club.visible = true;
  }

  // --- Frame ---------------------------------------------------------------

  update(
    dt: number,
    elapsed: number,
    input: Input,
    inputEnabled: boolean,
    simulateAuthority = true,
  ): void {
    if (!this.built || !this.hole) return;

    this.elapsedOnHole += dt;

    if (simulateAuthority && this.state === 'intro') {
      this.introTimer += dt;
      // The establishing orbit is skippable but ends on its own.
      if (this.introTimer > 3.4) this.beginPlay();
    }

    if (inputEnabled) this.handleInput(dt, input, simulateAuthority);
    else if (this.aim.charging) this.abortShot();

    if (simulateAuthority) {
      this.setRemoteReplicaMode(false);
      this.stepSimulation(dt);
      this.updateHoleLogic(dt);
    } else {
      this.setRemoteReplicaMode(true);
      this.interpolateRemoteBalls(dt);
      // Replicated balls are static, but the world still needs to advance so
      // kinematic lifts, ferries and rotators follow the shared host clock.
      this.physics.step(dt);
    }

    for (const update of this.built.updaters) update(dt, elapsed);
    for (const water of this.built.waters) water.update(elapsed, this.camera.camera.position);

    this.club.update(dt, elapsed);
    this.aim.update(dt, this.ball.position, this.surfaceResistance());
    this.trail.update(dt, this.ball.position, this.ball.speed, this.camera.camera);

    this.updateCamera(dt);
  }

  private handleInput(dt: number, input: Input, simulateAuthority: boolean): void {
    const pointer = input.pointer;

    // Right-drag orbits the camera without disturbing the aim line.
    if (pointer.orbit) {
      this.freeOrbiting = true;
      this.cameraYawOffset += pointer.dx * 0.0042;
      this.camera.orbit(0, -pointer.dy * 0.0032);
    } else if (Math.abs(pointer.dx) > 0 || input.aimAxis() !== 0) {
      // Any aiming input re-links the camera to the aim direction.
      this.freeOrbiting = false;
    }

    if (!this.freeOrbiting) {
      this.cameraYawOffset = damp(this.cameraYawOffset, 0, 8, dt);
    }

    if (input.pointer.wheel !== 0) this.camera.zoom(input.pointer.wheel * 0.8);
    if (input.consume('resetView')) {
      this.camera.resetZoom();
      this.cameraYawOffset = 0;
      this.freeOrbiting = false;
      if (this.built) this.aim.faceTarget(this.ball.position, this.built.cupPosition);
    }

    if (this.state !== 'aiming' && this.state !== 'charging') {
      if (this.aim.charging) this.abortShot();
      return;
    }

    // Aiming: pointer travel plus keyboard fine adjustment.
    if (!pointer.orbit) {
      const sensitivity = 0.0038;
      this.aim.rotate(-pointer.dx * sensitivity);
    }
    const keyboardAim = input.aimAxis();
    if (keyboardAim !== 0) this.aim.rotate(-keyboardAim * dt * 1.15);
    this.camera.orbit(0, input.pitchAxis() * dt * 0.6);

    // Charging.
    //
    // The press that dismissed the hole card is usually still held when play
    // starts, and without this latch that single click both skipped the intro
    // and began a swing — so the reflexive "click to continue" cost the player a
    // stroke before they had even seen the hole. The button must be released
    // once before it can charge anything.
    if (this.swallowPointerUntilRelease) {
      if (pointer.down) return;
      this.swallowPointerUntilRelease = false;
    }

    if (pointer.down && !this.aim.charging) {
      this.aim.beginCharge();
      this.state = 'charging';
    }
    if (this.aim.charging) this.club.setCharge(this.aim.charge);

    if (input.consume('shoot') && this.aim.charging) {
      if (simulateAuthority) this.fire();
      else this.requestAuthoritativeShot();
    }
  }

  private abortShot(): void {
    this.aim.cancelCharge();
    this.club.cancel();
    if (this.state === 'charging') this.state = 'aiming';
  }

  private fire(): void {
    if (!this.built) return;
    const activeState = this.activePlayerId ? this.multiplayerPlayers.get(this.activePlayerId) : null;
    if (this.multiplayerEnabled && !activeState) return;

    const power = this.aim.charge;
    const speed = this.aim.releaseCharge();
    const direction = this.aim.direction(this.tmp);

    this.club.release();
    this.strokes++;
    this.state = 'rolling';
    this.rollTime = 0;
    this.aim.visible = false;
    this.camera.setMode('follow');

    // A hard shot earns a wider establishing frame, which also reads as power.
    if (power > 0.72) window.setTimeout(() => this.maybeCinematic(), 260);

    // Just enough lift to make contact read as a strike, never enough to clear
    // a rail — see the note on Ball.strike.
    this.ball.strike(direction, speed, 0.015 + power * 0.02);

    this.juice.shake(0.035 + power * 0.09, 0.22);
    this.juice.hitStop(0.035 + power * 0.03, 0.6 + power * 0.4);
    this.juice.screenFlash(0.1 + power * 0.14, this.theme.rim);

    const contact = this.ball.position.clone();
    this.particles.impact(contact, UP, speed * 0.6, this.theme.rim);
    if (this.ball.surface === 'green' || this.ball.surface === 'fairway') {
      this.particles.grassClippings(contact, speed, this.theme.greenAlt);
    } else if (this.ball.surface === 'sand') {
      this.particles.sandPuff(contact, speed, this.theme.sand);
    }

    if (activeState) {
      activeState.strokes += 1;
      this.strokes = activeState.strokes;
    }

    this.events.emit('shot', {
      power,
      strokes: this.strokes,
      yaw: this.aim.yaw,
      playerId: this.activePlayerId,
    });
  }

  // --- Automated playtesting hooks -----------------------------------------
  //
  // The playtest bot drives these rather than reaching into private state, so
  // refactors inside the turn loop cannot silently break the harness that
  // proves every hole is completable.

  /** Plays a stroke directly. `power` is 0..1, `yaw` is the aim in radians. */
  devStrike(yaw: number, power: number): void {
    if (this.state !== 'aiming' && this.state !== 'charging') return;
    this.aim.yaw = yaw;
    this.aim.beginCharge();
    this.aim.charge = clamp01(power);
    this.fire();
  }

  private requestAuthoritativeShot(): void {
    const activeState = this.activePlayerId ? this.multiplayerPlayers.get(this.activePlayerId) : null;
    if (!this.built || !activeState) return;

    const power = this.aim.charge;
    this.aim.releaseCharge();
    this.club.release();
    this.state = 'rolling';
    this.aim.visible = false;
    this.camera.setMode('follow');
    this.events.emit('shotRequested', {
      power,
      yaw: this.aim.yaw,
      playerId: this.activePlayerId,
    });
  }

  /** Replays a stroke received from the player who owns the active turn. */
  networkStrike(yaw: number, power: number): boolean {
    if (this.state === 'intro') this.beginPlay();
    if (this.state !== 'aiming' && this.state !== 'charging') return false;
    this.devStrike(yaw, power);
    return true;
  }

  /**
   * Advances physics and hole logic with no presentation work, as fast as the
   * CPU allows. Returns the state the ball settled into.
   *
   * This is what makes a full 24-hole playtest take seconds instead of an hour:
   * it skips rendering, aiming, the trail and the camera, and steps the fixed
   * simulation directly.
   */
  devSimulateUntilRest(maxSeconds = 20, dt = 1 / 60): PlayState {
    let spent = 0;
    while (spent < maxSeconds) {
      spent += dt;
      // Updaters are driven by a clock that persists across calls. Feeding them
      // a per-call elapsed reset every lift and ferry to phase 0 at the start of
      // each simulated stroke, so the bot saw platform motion no player ever
      // would and timing holes were unverifiable.
      this.devClock += dt;
      this.stepSimulation(dt);
      this.updateHoleLogic(dt);
      if (this.built) {
        for (const update of this.built.updaters) update(dt, this.devClock);
      }
      if (this.state === 'sinking') {
        // Run the drop animation out so the hole reports as complete.
        for (let i = 0; i < 90 && this.state === 'sinking'; i++) this.updateSinking(dt);
        return this.state;
      }
      if (this.state === 'aiming') return this.state;
    }
    return this.state;
  }

  /**
   * Lets a moving platform finish carrying the ball before the bot plays on.
   *
   * A lift hole cannot be validated by a bot that strikes the instant the ball
   * comes to rest: the ball settles on the platform at the bottom of the shaft,
   * the bot immediately fires it back across the void, and the hole reports as
   * unplayable even though a player would simply have waited. This advances the
   * simulation while the ball is riding, and returns once the platform has
   * parked — which is exactly the window the hole is designed around.
   */
  devRidePlatform(maxSeconds = 12, dt = 1 / 60): void {
    if (!this.built) return;
    let spent = 0;
    let stillFrames = 0;
    while (spent < maxSeconds) {
      const probe = this.physics.probeSurface(this.ball.position, 0.6);
      const carrier = probe.hit && probe.body?.type === CANNON.Body.KINEMATIC ? probe.body : null;
      if (!carrier) return;

      // Parked *and* at the far end of its travel: a platform resting at the
      // bottom is where the ball got on, not where it wants off.
      const moving = Math.abs(carrier.velocity.y) > 0.05;
      stillFrames = moving ? 0 : stillFrames + 1;
      if (!moving && stillFrames > 6 && this.ball.position.y > this.rideStartY + 0.5) return;

      spent += dt;
      this.devClock += dt;
      this.stepSimulation(dt);
      this.updateHoleLogic(dt);
      for (const update of this.built.updaters) update(dt, this.devClock);
      if (this.state !== 'aiming') return;
    }
  }

  /** Height the ball was at when it last came to rest, for `devRidePlatform`. */
  private rideStartY = 0;
  private devClock = 0;

  /** Records the ball's height so the ride helper can tell up from down. */
  devMarkRideStart(): void {
    this.rideStartY = this.ball.position.y;
  }

  /** Straight-line distance from the ball to the cup, ignoring height. */
  devDistanceToCup(): number {
    if (!this.built) return Infinity;
    const p = this.ball.position;
    return Math.hypot(p.x - this.built.cupPosition.x, p.z - this.built.cupPosition.z);
  }

  /** Cup position for the loaded hole, for the bot's aim solver. */
  devCupPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.built ? target.copy(this.built.cupPosition) : target.set(0, 0, 0);
  }

  private maybeCinematic(): void {
    if (this.state === 'rolling' && this.ball.speed > 6) this.camera.setMode('cinematic');
  }

  private stepSimulation(dt: number): void {
    if (this.multiplayerEnabled) {
      this.multiplayerOrder.forEach((id) => {
        const state = this.multiplayerPlayers.get(id);
        if (!state || state.holed) return;
        state.ball.prePhysics(dt);
      });
      this.physics.step(dt);
      this.multiplayerOrder.forEach((id) => {
        const state = this.multiplayerPlayers.get(id);
        if (!state || state.holed) return;
        state.ball.clampSpeed();
        state.ball.postPhysics(dt);
      });
      return;
    }

    this.ball.prePhysics(dt);
    this.physics.step(dt);
    this.ball.clampSpeed();
    this.ball.postPhysics(dt);
  }

  private interpolateRemoteBalls(dt: number): void {
    const alpha = 1 - Math.exp(-22 * dt);
    for (const [playerId, target] of this.remoteTargets) {
      const player = this.multiplayerPlayers.get(playerId);
      if (!player) continue;
      const body = player.ball.body;
      body.position.x += (target.position[0] - body.position.x) * alpha;
      body.position.y += (target.position[1] - body.position.y) * alpha;
      body.position.z += (target.position[2] - body.position.z) * alpha;
      body.quaternion.x += (target.quaternion[0] - body.quaternion.x) * alpha;
      body.quaternion.y += (target.quaternion[1] - body.quaternion.y) * alpha;
      body.quaternion.z += (target.quaternion[2] - body.quaternion.z) * alpha;
      body.quaternion.w += (target.quaternion[3] - body.quaternion.w) * alpha;
      body.quaternion.normalize();
      body.velocity.set(...target.velocity);
      body.angularVelocity.set(...target.angularVelocity);
      player.ball.postPhysics(dt);
    }
  }

  private setRemoteReplicaMode(enabled: boolean): void {
    if (this.remoteReplicaMode === enabled) return;
    this.remoteReplicaMode = enabled;
    for (const state of this.multiplayerPlayers.values()) {
      state.ball.body.type = enabled ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
      state.ball.body.collisionResponse = !enabled;
      state.ball.body.updateMassProperties();
      if (!enabled) state.ball.body.wakeUp();
    }
  }

  private updateHoleLogic(dt: number): void {
    if (!this.built || !this.hole) return;

    if (this.multiplayerEnabled) {
      for (const state of this.multiplayerOrder.map((id) => this.multiplayerPlayers.get(id)).filter(Boolean) as MultiplayerBallState[]) {
        if (state.holed) continue;
        const position = state.ball.position;

        if (this.state === 'rolling' || this.state === 'aiming' || this.state === 'charging') {
          state.ball.attractTo(this.built.cupPosition, this.built.cupRadius, dt);

          const dx = position.x - this.built.cupPosition.x;
          const dz = position.z - this.built.cupPosition.z;
          const planar = Math.hypot(dx, dz);
          const heightDelta = position.y - this.built.cupPosition.y;
          const slowEnough = state.ball.speed < 6.4 && planar < this.built.cupRadius;
          const deadCentre = state.ball.speed < 10 && planar < this.built.cupRadius * 0.45;

          if (heightDelta < 0.42 && heightDelta > -0.6 && (slowEnough || deadCentre)) {
            this.sink(state);
            return;
          }
        }

        if (this.state !== 'rolling' || state.id !== this.activePlayerId) continue;
        this.rollTime += dt;

        for (const hazard of this.built.hazards) {
          if (
            position.x > hazard.min.x &&
            position.x < hazard.max.x &&
            position.z > hazard.min.z &&
            position.z < hazard.max.z &&
            position.y < hazard.max.y
          ) {
            this.applyPenalty(state, 'water');
            return;
          }
        }

        if (position.y < this.theme.killY) {
          this.applyPenalty(state, 'void');
          return;
        }

        this.safeTimer += dt;
        if (this.safeTimer > SAFE_SAMPLE_INTERVAL) {
          this.safeTimer = 0;
          if (state.ball.grounded && state.ball.speed < 3 && position.y > this.theme.killY + 2) {
            this.safePosition.copy(position);
          }
        }

        if (state.ball.atRest) {
          this.restDelay += dt;
          if (this.restDelay > 0.28) {
            this.finishStroke(state);
            return;
          }
        } else {
          this.restDelay = 0;
        }

        if (this.rollTime > STROKE_TIMEOUT) {
          this.finishStroke(state);
          return;
        }
      }
      return;
    }

    const position = this.ball.position;

    if (this.state === 'rolling' || this.state === 'aiming' || this.state === 'charging') {
      this.ball.attractTo(this.built.cupPosition, this.built.cupRadius, dt);

      const dx = position.x - this.built.cupPosition.x;
      const dz = position.z - this.built.cupPosition.z;
      const planar = Math.hypot(dx, dz);
      const heightDelta = position.y - this.built.cupPosition.y;

      const slowEnough = this.ball.speed < 6.4 && planar < this.built.cupRadius;
      const deadCentre = this.ball.speed < 10 && planar < this.built.cupRadius * 0.45;

      if (heightDelta < 0.42 && heightDelta > -0.6 && (slowEnough || deadCentre)) {
        this.sink();
        return;
      }
    }

    if (this.state !== 'rolling') return;

    this.rollTime += dt;

    for (const hazard of this.built.hazards) {
      if (
        position.x > hazard.min.x &&
        position.x < hazard.max.x &&
        position.z > hazard.min.z &&
        position.z < hazard.max.z &&
        position.y < hazard.max.y
      ) {
        this.applyPenalty(undefined, 'water');
        return;
      }
    }

    if (position.y < this.theme.killY) {
      this.applyPenalty(undefined, 'void');
      return;
    }

    this.safeTimer += dt;
    if (this.safeTimer > SAFE_SAMPLE_INTERVAL) {
      this.safeTimer = 0;
      if (this.ball.grounded && this.ball.speed < 3 && position.y > this.theme.killY + 2) {
        this.safePosition.copy(position);
      }
    }

    if (this.ball.atRest) {
      this.restDelay += dt;
      if (this.restDelay > 0.28) this.finishStroke();
    } else {
      this.restDelay = 0;
    }

    if (this.rollTime > STROKE_TIMEOUT) this.finishStroke();
  }

  private finishStroke(state?: MultiplayerBallState): void {
    this.restDelay = 0;
    this.state = 'aiming';
    this.camera.setMode('aim');
    this.aim.visible = true;
    this.club.visible = true;
    this.trail.clear();

    const activeBall = this.activePlayerId && this.multiplayerEnabled
      ? this.multiplayerPlayers.get(this.activePlayerId)?.ball ?? this.ball
      : this.ball;
    const position = activeBall.position;
    this.safePosition.copy(position);
    if (this.built) this.aim.faceTarget(position, this.built.cupPosition);
    if (this.multiplayerEnabled && state && this.activePlayerId === state.id) {
      this.advanceTurn();
    }
    this.events.emit('rest', { x: position.x, y: position.y, z: position.z });
  }

  private applyPenalty(state: MultiplayerBallState | undefined, reason: 'water' | 'void'): void {
    const ball = state?.ball ?? this.ball;
    const position = ball.position.clone();
    if (state) {
      state.strokes += 1;
      this.strokes = state.strokes;
    } else {
      this.strokes++;
    }

    if (reason === 'water') {
      this.particles.splash(position, 10, this.theme.foam);
      this.juice.shake(0.08, 0.3);
    } else {
      this.juice.shake(0.05, 0.25);
    }
    this.juice.screenFlash(0.16, reason === 'water' ? this.theme.water : 0x000000);

    this.events.emit('penalty', { reason, x: position.x, y: position.y, z: position.z });

    ball.reset(this.safePosition.x, this.safePosition.y + 0.08, this.safePosition.z);
    this.trail.clear();
    this.finishStroke(state);
  }

  private sink(state?: MultiplayerBallState): void {
    if (!this.built || !this.hole) return;
    const targetBall = state?.ball ?? this.ball;
    this.state = 'sinking';
    this.sinkTimer = 0;
    this.sinkStart.copy(targetBall.position);
    this.aim.visible = false;
    this.club.visible = false;
    this.trail.clear();

    if (this.multiplayerEnabled && state && !this.multiplayerWinnerId) {
      this.multiplayerWinnerId = state.id;
      this.events.emit('multiplayerWon', { playerId: state.id });
    }

    // Freeze the ball; the drop is animated so it always looks clean.
    targetBall.body.velocity.setZero();
    targetBall.body.angularVelocity.setZero();
    targetBall.body.type = CANNON.Body.KINEMATIC;

    this.particles.celebrate(this.built.cupPosition, this.theme.accent, this.theme.accentAlt);
    this.juice.shake(0.06, 0.4);
    this.juice.hitStop(0.06, 0.7);
    this.juice.screenFlash(0.35, 0xffffff);

    if (state) {
      state.holed = true;
      state.ball.visible = false;
      this.events.emit('holed', {
        strokes: state.strokes,
        par: this.hole.par,
        hole: 0,
      });
      return;
    }

    this.events.emit('holed', {
      strokes: this.strokes,
      par: this.hole.par,
      hole: 0,
    });
  }

  /** Animates the ball dropping into the cup. Returns true once finished. */
  updateSinking(dt: number): boolean {
    if (this.state !== 'sinking' || !this.built) return false;
    this.sinkTimer += dt;

    const t = clamp01(this.sinkTimer / 0.55);
    const eased = easeOutCubic(t);
    const target = this.built.cupPosition;
    const activeBall = this.activePlayerId && this.multiplayerEnabled
      ? this.multiplayerPlayers.get(this.activePlayerId)?.ball ?? this.ball
      : this.ball;

    activeBall.body.position.x = THREE.MathUtils.lerp(this.sinkStart.x, target.x, eased);
    activeBall.body.position.z = THREE.MathUtils.lerp(this.sinkStart.z, target.z, eased);
    activeBall.body.position.y = THREE.MathUtils.lerp(
      this.sinkStart.y,
      target.y - 0.34,
      t * t,
    );
    activeBall.postPhysics(dt);

    if (t >= 1 && this.state === 'sinking') {
      this.state = 'complete';
      activeBall.visible = false;
      return true;
    }
    return false;
  }

  private updateCamera(dt: number): void {
    const velocity = this.tmp.set(
      this.ball.body.velocity.x,
      this.ball.body.velocity.y,
      this.ball.body.velocity.z,
    );

    // In aim mode the camera sits opposite the aim direction, plus whatever
    // free-orbit offset the player has dialled in.
    if (this.state === 'aiming' || this.state === 'charging') {
      this.camera.yaw = this.aim.yaw + Math.PI + this.cameraYawOffset;
    }

    this.camera.addShake(this.juice.cameraOffset);
    this.camera.update(dt, this.ball.position, velocity, this.ball.speed);

    this.club.place(this.ball.position, this.aim.yaw);
  }

  private surfaceResistance(): number {
    switch (this.ball.surface) {
      case 'sand':
        return 6.2;
      case 'ice':
        return 0.12;
      case 'metal':
      case 'platform':
      case 'boost':
        return 0.55;
      default:
        return 0.95;
    }
  }

  // --- Collision response ---------------------------------------------------

  private onCollide(ball: Ball, other: CANNON.Body, contact: CANNON.ContactEquation): void {
    const meta = this.physics.metaFor(other);
    if (!meta) return;

    const now = performance.now();
    const relative = Math.abs(contact.getImpactVelocityAlongNormal());

    // Contact normal points from one body to the other; flip it if needed so
    // particles always spray away from the surface.
    this.contactNormal.set(contact.ni.x, contact.ni.y, contact.ni.z);
    if (contact.bi.id !== ball.body.id) this.contactNormal.negate();

    const point = ball.position.clone();

    // --- Pads --------------------------------------------------------------
    if (meta.launch) {
      ball.body.velocity.y = meta.launch;
      ball.body.wakeUp();
      this.built?.react(other.id, 1);
      this.particles.emit('spark', point, {
        count: 20,
        speed: 6,
        spread: 0.5,
        normal: UP,
        color: this.theme.accent,
        size: 100,
        life: 0.5,
      });
      this.juice.shake(0.05, 0.2);
      this.events.emit('impact', { x: point.x, y: point.y, z: point.z, speed: 12, kind: 'metal' });
      return;
    }

    if (meta.boost && meta.boostDir) {
      const current = ball.body.velocity;
      // Set rather than add along the boost axis, so repeatedly clipping a pad
      // cannot compound into an uncontrollable speed.
      current.x = meta.boostDir.x * meta.boost;
      current.z = meta.boostDir.z * meta.boost;
      this.ball.body.wakeUp();
      this.built?.react(other.id, 1);
      this.particles.emit('spark', point, {
        count: 22,
        speed: 7,
        spread: 0.7,
        normal: this.contactNormal,
        color: this.theme.accent,
        size: 110,
        life: 0.45,
      });
      this.juice.shake(0.06, 0.25);
      this.juice.screenFlash(0.12, this.theme.accent);
      this.events.emit('impact', { x: point.x, y: point.y, z: point.z, speed: 14, kind: 'metal' });
      return;
    }

    // Rate-limit ordinary contacts: a resting ball generates a contact every
    // step and would otherwise machine-gun the audio and particle systems.
    if (relative < 1.1 || now - this.lastCollisionTime < 45) return;
    this.lastCollisionTime = now;

    const kind: ImpactKind = meta.bumper
      ? 'bumper'
      : meta.surface === 'wall'
        ? 'wall'
        : meta.surface === 'sand'
          ? 'sand'
          : meta.surface === 'metal'
            ? 'metal'
            : 'ground';

    if (meta.bumper) {
      // Bumpers add energy along the contact normal.
      const boost = 3.4;
      ball.body.velocity.x += this.contactNormal.x * boost;
      ball.body.velocity.z += this.contactNormal.z * boost;
      this.built?.react(other.id, clamp01(relative / 8));
      this.juice.shake(0.05 + clamp01(relative / 20) * 0.06, 0.24);
      this.juice.hitStop(0.03, 0.5);
      this.juice.screenFlash(0.1, this.theme.accentAlt);
      this.particles.emit('spark', point, {
        count: 16,
        speed: 5,
        spread: 1.2,
        normal: this.contactNormal,
        color: this.theme.accentAlt,
        size: 90,
        life: 0.4,
      });
    } else {
      const strength = clamp01(relative / 14);
      if (strength > 0.18) {
        this.juice.shake(strength * 0.05, 0.16);
        this.particles.impact(point, this.contactNormal, relative, this.theme.rim);
      }
      if (meta.surface === 'sand') this.particles.sandPuff(point, relative, this.theme.sand);
    }

    this.events.emit('impact', {
      x: point.x,
      y: point.y,
      z: point.z,
      speed: relative,
      kind,
    });
  }

  // --- Lifecycle ------------------------------------------------------------

  private registerBall(ball: Ball): void {
    const handler = (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => this.onCollide(ball, event.body, event.contact);
    this.collisionHandlers.set(ball, handler);
    ball.body.addEventListener('collide', handler as never);
  }

  private disposeMultiplayerBall(ball: Ball): void {
    const handler = this.collisionHandlers.get(ball);
    if (handler) ball.body.removeEventListener('collide', handler as never);
    this.collisionHandlers.delete(ball);
    this.group.remove(ball.group, ball.shadowMesh);
    ball.dispose();
  }

  private advanceTurn(): void {
    if (!this.multiplayerEnabled || this.multiplayerOrder.length <= 1) return;
    const currentIndex = this.activePlayerId ? this.multiplayerOrder.indexOf(this.activePlayerId) : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % this.multiplayerOrder.length : 0;
    const nextId = this.multiplayerOrder[nextIndex];
    this.setActiveMultiplayerPlayer(nextId);
  }

  private unloadHole(): void {
    if (!this.built) return;
    this.group.remove(this.built.group);
    this.built.dispose();
    this.built = null;
    // Restore dynamics in case the previous hole ended mid-sink.
    this.ball.body.type = CANNON.Body.DYNAMIC;
    this.ball.body.updateMassProperties();
    for (const state of this.multiplayerPlayers.values()) {
      state.ball.body.type = CANNON.Body.DYNAMIC;
      state.ball.body.updateMassProperties();
    }
  }

  dispose(): void {
    for (const [ball, handler] of this.collisionHandlers) {
      ball.body.removeEventListener('collide', handler as never);
    }
    this.collisionHandlers.clear();
    this.unloadHole();
    for (const state of this.multiplayerPlayers.values()) {
      this.group.remove(state.ball.group, state.ball.shadowMesh);
      state.ball.dispose();
    }
    this.multiplayerPlayers.clear();
    this.soloBall.dispose();
    this.club.dispose();
    this.aim.dispose();
    this.trail.dispose();
    this.events.clear();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

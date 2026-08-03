/**
 * Pointer + keyboard input, normalised into the handful of intents the game cares about.
 *
 * The canvas is the only listener target for pointer events so UI overlays keep
 * their own click handling; `enabled` is toggled by the state machine whenever a
 * menu is open so a stray click behind the menu cannot fire a shot.
 */
export interface PointerState {
  /** Cumulative horizontal drag since last frame, in pixels. */
  dx: number;
  /** Cumulative vertical drag since last frame, in pixels. */
  dy: number;
  /** Normalised device coordinates of the cursor. */
  ndcX: number;
  ndcY: number;
  /** Primary button currently held. */
  down: boolean;
  /** Secondary (right) button currently held — orbits the camera without charging. */
  orbit: boolean;
  /** Wheel delta accumulated since last frame. */
  wheel: number;
}

export type InputAction = 'shoot' | 'cancel' | 'pause' | 'resetView' | 'restartHole' | 'toggleTop';

export class Input {
  readonly pointer: PointerState = {
    dx: 0,
    dy: 0,
    ndcX: 0,
    ndcY: 0,
    down: false,
    orbit: false,
    wheel: 0,
  };

  enabled = true;

  private pressed = new Set<string>();
  private justPressed = new Set<string>();
  private actions = new Set<InputAction>();
  private disposers: Array<() => void> = [];

  constructor(private readonly element: HTMLElement) {
    this.bind();
  }

  private bind(): void {
    const el = this.element;

    const onPointerDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      // Capture keeps a drag alive if the cursor leaves the canvas, but it
      // throws for a pointer id the browser does not consider active. Losing a
      // shot to that exception is far worse than losing capture.
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* Capture is an optimisation, not a requirement. */
      }
      if (e.button === 0) this.pointer.down = true;
      if (e.button === 2 || e.button === 1) this.pointer.orbit = true;
      this.updateNdc(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        if (this.pointer.down) this.actions.add('shoot');
        this.pointer.down = false;
      }
      if (e.button === 2 || e.button === 1) this.pointer.orbit = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      this.pointer.dx += e.movementX || 0;
      this.pointer.dy += e.movementY || 0;
      this.updateNdc(e);
    };

    const onWheel = (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.pointer.wheel += Math.sign(e.deltaY);
    };

    const onContext = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.pressed.add(e.code);
      this.justPressed.add(e.code);
      switch (e.code) {
        case 'Escape':
          this.actions.add('pause');
          break;
        case 'KeyC':
          this.actions.add('resetView');
          break;
        case 'KeyR':
          this.actions.add('restartHole');
          break;
        case 'KeyT':
          this.actions.add('toggleTop');
          break;
        case 'Space':
          e.preventDefault();
          if (this.enabled) this.pointer.down = true;
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.code);
      if (e.code === 'Space') {
        if (this.pointer.down) this.actions.add('shoot');
        this.pointer.down = false;
      }
    };

    const onBlur = () => {
      // Releasing focus mid-charge should abandon the shot, not fire it.
      this.pressed.clear();
      this.pointer.down = false;
      this.pointer.orbit = false;
      this.actions.add('cancel');
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this.disposers.push(() => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  private updateNdc(e: PointerEvent): void {
    const rect = this.element.getBoundingClientRect();
    this.pointer.ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  isDown(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Movement vector from WASD / arrow keys, used for fine aim nudging. */
  aimAxis(): number {
    let axis = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) axis -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) axis += 1;
    return axis;
  }

  pitchAxis(): number {
    let axis = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) axis += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) axis -= 1;
    return axis;
  }

  consume(action: InputAction): boolean {
    if (!this.actions.has(action)) return false;
    this.actions.delete(action);
    return true;
  }

  /** Clears per-frame deltas. Call at the very end of the frame. */
  endFrame(): void {
    this.pointer.dx = 0;
    this.pointer.dy = 0;
    this.pointer.wheel = 0;
    this.justPressed.clear();
    this.actions.clear();
  }

  /** Drops any in-progress charge, e.g. when a menu opens. */
  release(): void {
    this.pointer.down = false;
    this.pointer.orbit = false;
    this.actions.clear();
  }

  dispose(): void {
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
  }
}

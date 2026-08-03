/**
 * Minimal typed publish/subscribe bus.
 *
 * Systems (audio, FX, UI, scoring) react to gameplay without the gameplay code
 * holding references to them — that keeps `HoleRuntime` free of presentation
 * concerns and avoids the global singletons the architecture brief forbids.
 */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so a listener unsubscribing during dispatch cannot skip its neighbour.
    for (const listener of [...set]) (listener as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Everything the game broadcasts. Payloads stay plain data — no THREE types. */
export interface GameEvents {
  /** A stroke was played. */
  shot: { power: number; strokes: number };
  /** Ball struck a wall/obstacle. `speed` drives impact volume and particle count. */
  impact: { x: number; y: number; z: number; speed: number; kind: ImpactKind };
  /** Ball dropped in the cup. */
  holed: { strokes: number; par: number; hole: number };
  /** Ball came to rest and control returns to the player. */
  rest: { x: number; y: number; z: number };
  /** Ball left the playable area; a penalty stroke was applied. */
  penalty: { reason: 'water' | 'void'; x: number; y: number; z: number };
  /** A hole finished and the next one is loading. */
  holeChanged: { course: string; hole: number };
  /** The active multiplayer turn changed. */
  multiplayerTurnChanged: { playerId: string | null };
  /** A multiplayer player won the match. */
  multiplayerWon: { playerId: string };
  /** Round complete for the active course. */
  courseComplete: { course: string; strokes: number; par: number; time: number };
  /** UI click/hover feedback. */
  ui: { kind: 'hover' | 'click' | 'back' | 'confirm' };
}

export type ImpactKind = 'wall' | 'ground' | 'bumper' | 'water' | 'sand' | 'metal' | 'club';

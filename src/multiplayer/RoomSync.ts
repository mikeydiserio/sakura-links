import { Peer, type DataConnection } from 'peerjs';

export interface RoomPlayer {
  id: string;
  name: string;
  color: string;
  avatar: string;
  isHost: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomState {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  status: RoomStatus;
  currentTurnPlayerId: string | null;
  winnerPlayerId: string | null;
  startedAt: number | null;
  courseId: string | null;
}

export type NetworkPlayState = 'intro' | 'aiming' | 'charging' | 'rolling' | 'sinking' | 'complete';

export interface ShotCommand {
  kind: 'shot-command';
  sequence: number;
  playerId: string;
  yaw: number;
  power: number;
}

export interface BallSnapshot {
  playerId: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  strokes: number;
  holed: boolean;
  visible: boolean;
}

export interface MatchSnapshot {
  kind: 'state-snapshot';
  sequence: number;
  /** Seconds since the host started the match. */
  matchTime: number;
  holeIndex: number;
  playState: NetworkPlayState;
  activePlayerId: string | null;
  winnerPlayerId: string | null;
  aimYaw: number;
  balls: BallSnapshot[];
}

export type MatchEvent = ShotCommand | MatchSnapshot;

type RoomMessage =
  | { type: 'join-request'; profile: RoomPlayer }
  | { type: 'join-error'; reason: string }
  | { type: 'room-update'; room: RoomState }
  | { type: 'match-event'; roomCode: string; event: MatchEvent };

/**
 * Internet room transport.
 *
 * The host owns a memorable PeerJS id derived from the five-character room
 * code. Guests connect directly to it over an encrypted WebRTC data channel;
 * the PeerJS cloud service is used only for signalling. The host is the room
 * authority and fans updates/events out to all guests.
 */
export class RoomSync {
  private readonly storageKey = 'sakura-links-room';
  private room: RoomState | null = null;
  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private readonly guestConnections = new Map<DataConnection, string>();
  private isHost = false;
  private readonly listeners = new Set<(room: RoomState | null) => void>();
  private readonly matchListeners = new Set<(event: MatchEvent, room: RoomState | null) => void>();

  get isHostValue(): boolean {
    return this.isHost;
  }

  async createRoom(profile: RoomPlayer): Promise<RoomState | null> {
    this.resetNetwork();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode();
      const peer = new Peer(this.peerId(code));
      try {
        await this.waitForPeer(peer);
        this.peer = peer;
        this.isHost = true;
        peer.on('connection', (connection) => this.acceptGuest(connection));

        const room: RoomState = {
          code,
          hostId: profile.id,
          players: [{ ...profile, isHost: true }],
          status: 'lobby',
          currentTurnPlayerId: null,
          winnerPlayerId: null,
          startedAt: null,
          courseId: null,
        };
        this.setRoom(room);
        return room;
      } catch (error) {
        peer.destroy();
        if (this.peerErrorType(error) !== 'unavailable-id') return null;
      }
    }
    return null;
  }

  async joinRoom(code: string, profile: RoomPlayer): Promise<RoomState | null> {
    this.resetNetwork();
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(normalizedCode)) return null;

    const peer = new Peer();
    this.peer = peer;
    try {
      await this.waitForPeer(peer);
      const connection = peer.connect(this.peerId(normalizedCode), {
        reliable: true,
        serialization: 'json',
      });
      this.hostConnection = connection;
      return await new Promise<RoomState | null>((resolve) => {
        let settled = false;
        const finish = (room: RoomState | null): void => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(room);
        };
        const timeout = window.setTimeout(() => finish(null), 10_000);

        connection.on('open', () => {
          connection.send({ type: 'join-request', profile } satisfies RoomMessage);
        });
        connection.on('data', (data) => {
          const message = this.asMessage(data);
          if (!message) return;
          if (message.type === 'room-update') {
            this.receiveRoom(message.room);
            finish(message.room);
          } else if (message.type === 'join-error') {
            finish(null);
          } else if (message.type === 'match-event') {
            this.receiveMatchEvent(message);
          }
        });
        connection.on('error', () => finish(null));
        connection.on('close', () => {
          if (!settled) finish(null);
        });
      });
    } catch {
      this.resetNetwork();
      return null;
    }
  }

  getRoom(): RoomState | null {
    return this.room;
  }

  setRoom(room: RoomState): void {
    this.room = room;
    this.persist(room);
    if (this.isHost) this.broadcast({ type: 'room-update', room });
    this.emitRoom();
  }

  sendShotCommand(roomCode: string, command: ShotCommand): void {
    if (this.isHost || !this.room || this.room.code !== roomCode || !this.hostConnection?.open) return;
    this.hostConnection.send({ type: 'match-event', roomCode, event: command } satisfies RoomMessage);
  }

  broadcastSnapshot(roomCode: string, snapshot: MatchSnapshot): void {
    if (!this.isHost || !this.room || this.room.code !== roomCode) return;
    this.broadcast({ type: 'match-event', roomCode, event: snapshot });
  }

  onRoomChange(listener: (room: RoomState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onMatchEvent(listener: (event: MatchEvent, room: RoomState | null) => void): () => void {
    this.matchListeners.add(listener);
    return () => this.matchListeners.delete(listener);
  }

  dispose(): void {
    this.resetNetwork();
    this.listeners.clear();
    this.matchListeners.clear();
  }

  private acceptGuest(connection: DataConnection): void {
    connection.on('data', (data) => {
      const message = this.asMessage(data);
      if (!message) return;

      if (message.type === 'join-request') {
        if (!this.room || this.room.status !== 'lobby' || this.room.players.length >= 4) {
          connection.send({ type: 'join-error', reason: 'Room is unavailable' } satisfies RoomMessage);
          window.setTimeout(() => connection.close(), 100);
          return;
        }

        const profile = { ...message.profile, isHost: false };
        const existing = this.room.players.find((player) => player.id === profile.id);
        if (existing) Object.assign(existing, profile);
        else this.room.players.push(profile);
        this.guestConnections.set(connection, profile.id);
        this.setRoom(this.room);
        return;
      }

      if (
        message.type === 'match-event' &&
        message.roomCode === this.room?.code &&
        message.event.kind === 'shot-command'
      ) {
        const playerId = this.guestConnections.get(connection);
        if (!playerId || message.event.playerId !== playerId) return;
        this.matchListeners.forEach((listener) => listener(message.event, this.room));
      }
    });

    connection.on('close', () => {
      const playerId = this.guestConnections.get(connection);
      this.guestConnections.delete(connection);
      if (!playerId || !this.room || this.room.status !== 'lobby') return;
      this.room.players = this.room.players.filter((player) => player.id !== playerId);
      this.setRoom(this.room);
    });
  }

  private receiveRoom(room: RoomState): void {
    this.room = room;
    this.persist(room);
    this.emitRoom();
  }

  private receiveMatchEvent(message: Extract<RoomMessage, { type: 'match-event' }>): void {
    if (message.roomCode !== this.room?.code || message.event.kind !== 'state-snapshot') return;
    this.matchListeners.forEach((listener) => listener(message.event, this.room));
  }

  private broadcast(message: RoomMessage, except?: DataConnection): void {
    for (const connection of this.guestConnections.keys()) {
      if (connection !== except && connection.open) connection.send(message);
    }
  }

  private emitRoom(): void {
    this.listeners.forEach((listener) => listener(this.room));
  }

  private persist(room: RoomState): void {
    localStorage.setItem(`${this.storageKey}:${room.code}`, JSON.stringify(room));
  }

  private resetNetwork(): void {
    this.hostConnection?.close();
    this.hostConnection = null;
    for (const connection of this.guestConnections.keys()) connection.close();
    this.guestConnections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.isHost = false;
  }

  private waitForPeer(peer: Peer): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Peer connection timed out')), 10_000);
      peer.on('open', () => {
        window.clearTimeout(timeout);
        resolve();
      });
      peer.on('error', (error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private asMessage(value: unknown): RoomMessage | null {
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    return value as RoomMessage;
  }

  private peerErrorType(error: unknown): string {
    return typeof error === 'object' && error !== null && 'type' in error
      ? String((error as { type: unknown }).type)
      : '';
  }

  private peerId(code: string): string {
    return `sakura-links-${code.toLowerCase()}`;
  }

  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const random = new Uint32Array(5);
    crypto.getRandomValues(random);
    for (let i = 0; i < random.length; i++) code += alphabet[random[i] % alphabet.length];
    return code;
  }
}

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
}

export interface MatchEvent {
  kind: 'start' | 'turn' | 'shot' | 'state';
  payload: Record<string, unknown>;
}

interface RoomMessage {
  type: 'room-update' | 'match-event';
  room?: RoomState;
  roomCode?: string;
  event?: MatchEvent;
}

export class RoomSync {
  private readonly channel: BroadcastChannel | null;
  private readonly storageKey = 'sakura-links-room';
  private room: RoomState | null = null;
  private readonly listeners = new Set<(room: RoomState | null) => void>();
  private readonly matchListeners = new Set<(event: MatchEvent, room: RoomState | null) => void>();

  constructor() {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sakura-links-mp') : null;
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<RoomMessage>) => this.receive(event.data);
    }
    window.addEventListener('storage', this.handleStorage);
  }

  createRoom(profile: RoomPlayer): RoomState {
    const code = this.generateCode();
    const room: RoomState = {
      code,
      hostId: profile.id,
      players: [{ ...profile, isHost: true }],
      status: 'lobby',
      currentTurnPlayerId: null,
      winnerPlayerId: null,
      startedAt: null,
    };
    this.setRoom(room);
    return room;
  }

  joinRoom(code: string, profile: RoomPlayer): RoomState | null {
    const room = this.loadRoom(code);
    if (!room || room.players.length >= 4) return null;

    const existing = room.players.find((player) => player.id === profile.id);
    if (existing) {
      existing.name = profile.name;
      existing.color = profile.color;
      existing.avatar = profile.avatar;
      existing.isHost = existing.isHost;
    } else {
      room.players.push({ ...profile, isHost: false });
    }

    this.setRoom(room);
    return room;
  }

  getRoom(): RoomState | null {
    return this.room;
  }

  setRoom(room: RoomState): void {
    this.room = room;
    this.persist(room);
    this.channel?.postMessage({ type: 'room-update', room });
    this.emitRoom();
  }

  broadcastMatchEvent(roomCode: string, event: MatchEvent): void {
    if (!this.room) return;
    this.channel?.postMessage({ type: 'match-event', roomCode, event });
    this.matchListeners.forEach((listener) => listener(event, this.room));
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
    window.removeEventListener('storage', this.handleStorage);
    this.channel?.close();
    this.listeners.clear();
    this.matchListeners.clear();
  }

  private receive(message: RoomMessage): void {
    if (message.type === 'room-update' && message.room) {
      this.room = message.room;
      this.emitRoom();
      return;
    }

    if (message.type === 'match-event' && message.roomCode && message.event && this.room?.code === message.roomCode) {
      this.matchListeners.forEach((listener) => listener(message.event as MatchEvent, this.room));
    }
  }

  private handleStorage = (event: StorageEvent): void => {
    if (event.key?.startsWith(this.storageKey) && event.newValue) {
      const room = this.parseRoom(event.newValue);
      if (room) {
        this.room = room;
        this.emitRoom();
      }
    }
  };

  private emitRoom(): void {
    this.listeners.forEach((listener) => listener(this.room));
  }

  private persist(room: RoomState): void {
    localStorage.setItem(`${this.storageKey}:${room.code}`, JSON.stringify(room));
  }

  private loadRoom(code: string): RoomState | null {
    const raw = localStorage.getItem(`${this.storageKey}:${code}`);
    return raw ? this.parseRoom(raw) : null;
  }

  private parseRoom(raw: string): RoomState | null {
    try {
      const parsed = JSON.parse(raw) as Partial<RoomState>;
      if (!parsed.code || !parsed.players) return null;
      return {
        code: parsed.code,
        hostId: parsed.hostId ?? '',
        players: parsed.players,
        status: parsed.status ?? 'lobby',
        currentTurnPlayerId: parsed.currentTurnPlayerId ?? null,
        winnerPlayerId: parsed.winnerPlayerId ?? null,
        startedAt: parsed.startedAt ?? null,
      };
    } catch {
      return null;
    }
  }

  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }
}

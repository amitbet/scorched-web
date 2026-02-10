import type {
  ChatMessage,
  GameInputPayload,
  GameSnapshotPayload,
  MatchStartPayload,
  RoomState,
  RoomSummary,
  SignalEnvelope,
  SignalRoomCreated,
  SignalRoomFull,
  SignalRoomJoined,
  SignalRoomListResponse,
  SignalRoomNotFound,
} from './protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

export interface SignalClientHandlers {
  onRoomState?: (room: RoomState) => void;
  onChat?: (msg: ChatMessage) => void;
  onMatchStart?: (payload: MatchStartPayload) => void;
  onGameInput?: (peerId: string, payload: GameInputPayload) => void;
  onGameSnapshot?: (payload: GameSnapshotPayload) => void;
  onShopBuy?: (peerId: string, roomId: string, weaponId: string) => void;
  onShopSell?: (peerId: string, roomId: string, weaponId: string) => void;
  onShopDone?: (peerId: string, roomId: string, done: boolean) => void;
  onPeerRename?: (peerId: string, roomId: string, name: string) => void;
  onError?: (message: string) => void;
}

export class SignalClient {
  private ws: WebSocket | null = null;
  private requestSeq = 1;
  private pending = new Map<string, PendingRequest>();
  private handlers: SignalClientHandlers;

  constructor(handlers: SignalClientHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: SignalClientHandlers): void {
    this.handlers = handlers;
  }

  connect(endpoint: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const normalized = endpoint.startsWith('ws://') || endpoint.startsWith('wss://') ? endpoint : `ws://${endpoint}`;
      const ws = new WebSocket(`${normalized}/ws`);
      this.ws = ws;

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Unable to connect to LAN signaling server'));
      ws.onclose = () => {
        this.ws = null;
        this.failPending('Disconnected from signaling server');
      };
      ws.onmessage = (event) => {
        this.onMessage(event.data);
      };
    });
  }

  disconnect(): void {
    if (!this.ws) {
      return;
    }
    this.ws.close();
    this.ws = null;
    this.failPending('Disconnected from signaling server');
  }

  listRooms(): Promise<RoomSummary[]> {
    return this.request<SignalRoomListResponse>('room.list.request', {}).then((res) => res.rooms);
  }

  createRoom(roomName: string, hostName: string, maxPlayers: number): Promise<SignalRoomCreated> {
    return this.request<SignalRoomCreated>('room.create', { roomName, hostName, maxPlayers });
  }

  joinRoom(roomId: string, playerName: string): Promise<SignalRoomJoined> {
    return this.request<SignalRoomJoined>('room.join', { roomId, playerName });
  }

  setReady(roomId: string, ready: boolean): void {
    this.send('peer.ready', { roomId, ready });
  }

  sendChat(roomId: string, text: string): void {
    this.send('chat.msg', { roomId, text });
  }

  startMatch(roomId: string, forceStart = false): void {
    this.send('match.start', { roomId, forceStart });
  }

  sendGameInput(payload: GameInputPayload): void {
    this.send('game.input', payload);
  }

  sendGameSnapshot(payload: GameSnapshotPayload): void {
    this.send('game.snapshot', payload);
  }

  sendShopBuy(roomId: string, weaponId: string): void {
    this.send('shop.buy', { roomId, weaponId });
  }

  sendShopSell(roomId: string, weaponId: string): void {
    this.send('shop.sell', { roomId, weaponId });
  }

  sendShopDone(roomId: string, done: boolean): void {
    this.send('shop.done', { roomId, done });
  }

  sendRename(roomId: string, name: string): void {
    this.send('peer.rename', { roomId, name });
  }

  leaveRoom(roomId: string): void {
    this.send('room.leave', { roomId });
  }

  private request<T>(type: string, payload: unknown): Promise<T> {
    const requestId = `req-${this.requestSeq++}`;
    this.send(type, payload, requestId);

    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request timed out: ${type}`));
      }, 7000);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timeoutId });
    });
  }

  private send(type: string, payload: unknown, requestId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to signaling server');
    }
    const message: SignalEnvelope = { type, payload };
    if (requestId) {
      message.requestId = requestId;
    }
    this.ws.send(JSON.stringify(message));
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let parsed: SignalEnvelope;
    try {
      parsed = JSON.parse(raw) as SignalEnvelope;
    } catch {
      return;
    }

    if (parsed.requestId && this.pending.has(parsed.requestId)) {
      const pending = this.pending.get(parsed.requestId)!;
      this.pending.delete(parsed.requestId);
      window.clearTimeout(pending.timeoutId);

      if (parsed.type === 'error') {
        const payload = parsed.payload as { message?: string };
        pending.reject(new Error(payload.message ?? 'Unknown signaling error'));
      } else {
        pending.resolve(parsed.payload);
      }
      return;
    }

    switch (parsed.type) {
      case 'room.state': {
        const payload = parsed.payload as { room: RoomState };
        this.handlers.onRoomState?.(payload.room);
        break;
      }
      case 'chat.msg': {
        this.handlers.onChat?.(parsed.payload as ChatMessage);
        break;
      }
      case 'match.start': {
        this.handlers.onMatchStart?.(parsed.payload as MatchStartPayload);
        break;
      }
      case 'game.input': {
        const payload = parsed.payload as { peerId: string; data: GameInputPayload };
        this.handlers.onGameInput?.(payload.peerId, payload.data);
        break;
      }
      case 'game.snapshot': {
        this.handlers.onGameSnapshot?.(parsed.payload as GameSnapshotPayload);
        break;
      }
      case 'shop.buy': {
        const payload = parsed.payload as { peerId: string; roomId: string; weaponId: string };
        this.handlers.onShopBuy?.(payload.peerId, payload.roomId, payload.weaponId);
        break;
      }
      case 'shop.sell': {
        const payload = parsed.payload as { peerId: string; roomId: string; weaponId: string };
        this.handlers.onShopSell?.(payload.peerId, payload.roomId, payload.weaponId);
        break;
      }
      case 'shop.done': {
        const payload = parsed.payload as { peerId: string; roomId: string; done: boolean };
        this.handlers.onShopDone?.(payload.peerId, payload.roomId, payload.done);
        break;
      }
      case 'peer.rename': {
        const payload = parsed.payload as { peerId: string; roomId: string; name: string };
        this.handlers.onPeerRename?.(payload.peerId, payload.roomId, payload.name);
        break;
      }
      case 'room.full': {
        const payload = parsed.payload as SignalRoomFull;
        this.handlers.onError?.(`Room is full (${payload.currentPlayers}/${payload.maxPlayers})`);
        break;
      }
      case 'room.not_found': {
        const payload = parsed.payload as SignalRoomNotFound;
        this.handlers.onError?.(`Room not found: ${payload.roomId}`);
        break;
      }
      case 'error': {
        const payload = parsed.payload as { message?: string };
        this.handlers.onError?.(payload.message ?? 'Signaling error');
        break;
      }
      default:
        break;
    }
  }

  private failPending(reason: string): void {
    for (const [requestId, pending] of this.pending) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
      this.pending.delete(requestId);
    }
  }
}

export type RoomStatus = 'lobby' | 'in-game';

export interface RoomSummary {
  roomId: string;
  roomName: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  status: RoomStatus;
}

export interface LobbyPlayer {
  peerId: string;
  name: string;
  ready: boolean;
  isHost: boolean;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  status: RoomStatus;
  maxPlayers: number;
  players: LobbyPlayer[];
}

export interface SignalEnvelope<T = unknown> {
  type: string;
  requestId?: string;
  payload: T;
}

export interface SignalErrorPayload {
  code: 'room_full' | 'room_not_found' | 'forbidden' | 'bad_request';
  message: string;
}

export interface SignalRoomListResponse {
  rooms: RoomSummary[];
}

export interface SignalRoomCreated {
  selfPeerId: string;
  room: RoomState;
}

export interface SignalRoomJoined {
  selfPeerId: string;
  room: RoomState;
}

export interface SignalRoomNotFound {
  roomId: string;
}

export interface SignalRoomFull {
  roomId: string;
  currentPlayers: number;
  maxPlayers: number;
}

export interface ChatMessage {
  roomId: string;
  peerId: string;
  name: string;
  text: string;
  at: number;
}

export interface LanEndpoint {
  host: string;
  port: number;
}

export interface TerrainPayload {
  width: number;
  height: number;
  revision: number;
  heights: number[];
  maskB64: string;
  colorIndicesB64?: string;
  colorPalette?: Array<[number, number, number]>;
}

export interface MatchStartPayload {
  roomId: string;
  startedAt: number;
}

export interface GameInputPayload {
  roomId: string;
  input: {
    moveLeft: boolean;
    moveRight: boolean;
    alt: boolean;
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    fastUp: boolean;
    fastDown: boolean;
    firePressed: boolean;
    weaponCycle: number;
    toggleShieldMenu: boolean;
    powerSet: number | null;
  };
  deltaMs: number;
}

export interface GameSnapshotPayload {
  roomId: string;
  tick: number;
  view?: 'shop' | 'battle';
  shopIndex?: number;
  shopDoneByPlayerId?: Record<string, boolean>;
  match: unknown;
  runtime: unknown;
  message: string;
  terrain?: TerrainPayload;
}

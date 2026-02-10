import { useEffect, useMemo, useRef, useState } from 'react';
import { SignalClient } from '../net/signalingClient';
import type { ChatMessage, RoomState, RoomSummary } from '../net/protocol';
import { loadNetPrefs, saveNetPrefs } from '../utils/storage';

export interface LanMatchSession {
  client: SignalClient;
  roomId: string;
  selfPeerId: string;
  room: RoomState;
}

interface LanScreenProps {
  initialMode: 'host' | 'join';
  onBack: () => void;
  onMatchStart: (session: LanMatchSession) => void;
}

export function LanScreen({ initialMode, onBack, onMatchStart }: LanScreenProps): JSX.Element {
  const prefs = useMemo(() => loadNetPrefs(), []);
  const [mode, setMode] = useState<'host' | 'join'>(initialMode);
  const [endpoint, setEndpoint] = useState(prefs?.lastEndpoint || '127.0.0.1:8787');
  const [preferredName, setPreferredName] = useState(prefs?.lastPlayerName || '');
  const [roomName, setRoomName] = useState("Host's Game");
  const [renameDraft, setRenameDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selfPeerId, setSelfPeerId] = useState('');
  const roomStateRef = useRef<RoomState | null>(null);
  const selfPeerIdRef = useRef('');
  const clientRef = useRef<SignalClient | null>(null);
  const handoffInProgressRef = useRef(false);
  const renameTimerRef = useRef<number | null>(null);
  const lastServerNameRef = useRef('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    selfPeerIdRef.current = selfPeerId;
  }, [selfPeerId]);

  useEffect(() => {
    if (mode !== 'join' || roomState) {
      return;
    }
    const endpointValue = endpoint.trim();
    if (!endpointValue) {
      setRooms([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshRooms();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [mode, endpoint, roomState]);

  useEffect(() => {
    if (mode !== 'join' || roomState || busy || rooms.length > 0) {
      return;
    }
    const endpointValue = endpoint.trim();
    if (!endpointValue) {
      return;
    }
    const pollId = window.setTimeout(() => {
      void refreshRooms();
    }, 2000);
    return () => window.clearTimeout(pollId);
  }, [mode, roomState, busy, rooms.length, endpoint]);

  useEffect(() => {
    const self = roomState?.players.find((p) => p.peerId === selfPeerId);
    if (self) {
      if (renameDraft.trim().length === 0 || renameDraft === lastServerNameRef.current) {
        setRenameDraft(self.name);
      }
      lastServerNameRef.current = self.name;
    } else {
      lastServerNameRef.current = '';
      if (renameDraft.length > 0) {
        setRenameDraft('');
      }
    }
  }, [roomState, selfPeerId, renameDraft]);

  useEffect(() => {
    const self = roomState?.players.find((p) => p.peerId === selfPeerId);
    if (!roomState || !self) {
      return;
    }
    const next = renameDraft.trim();
    if (!next || next === self.name) {
      return;
    }
    if (renameTimerRef.current) {
      window.clearTimeout(renameTimerRef.current);
    }
    renameTimerRef.current = window.setTimeout(() => {
      try {
        clientRef.current?.sendRename(roomState.roomId, next);
        saveNetPrefs({ lastEndpoint: endpoint.trim(), lastPlayerName: next });
        setPreferredName(next);
        setError('');
      } catch {
        setError('Not connected');
      }
    }, 2000);

    return () => {
      if (renameTimerRef.current) {
        window.clearTimeout(renameTimerRef.current);
        renameTimerRef.current = null;
      }
    };
  }, [endpoint, renameDraft, roomState, selfPeerId]);

  useEffect(() => {
    return () => {
      if (renameTimerRef.current) {
        window.clearTimeout(renameTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (handoffInProgressRef.current) {
        return;
      }
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  const setClientHandlers = (client: SignalClient): void => {
    client.setHandlers({
      onRoomState: (nextRoom) => {
        setRoomState(nextRoom);
      },
      onChat: (msg) => {
        setChatMessages((prev) => [...prev.slice(-79), msg]);
      },
      onMatchStart: () => {
        const client = clientRef.current;
        const currentRoom = roomStateRef.current;
        const currentPeerId = selfPeerIdRef.current;
        if (!client || !currentRoom || !currentPeerId) {
          setError('Match start received but room session is incomplete');
          return;
        }
        handoffInProgressRef.current = true;
        onMatchStart({
          client,
          roomId: currentRoom.roomId,
          selfPeerId: currentPeerId,
          room: currentRoom,
        });
      },
      onError: (msg) => {
        setError(msg);
      },
    });
  };

  const ensureConnected = async (): Promise<SignalClient> => {
    const existing = clientRef.current;
    if (existing) {
      return existing;
    }
    const client = new SignalClient();
    setClientHandlers(client);
    await client.connect(endpoint.trim());
    clientRef.current = client;
    setConnected(true);
    saveNetPrefs({ lastEndpoint: endpoint.trim(), lastPlayerName: preferredName.trim() });
    return client;
  };

  const refreshRooms = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const client = await ensureConnected();
      const nextRooms = await client.listRooms();
      setRooms(nextRooms);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch rooms';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const client = await ensureConnected();
      const room = await client.createRoom(roomName.trim() || "Host's Game", preferredName.trim(), 10);
      setSelfPeerId(room.selfPeerId);
      setRoomState(room.room);
      if (preferredName.trim()) {
        setRenameDraft(preferredName.trim());
      }
      setRoomId(room.room.roomId);
      setChatMessages([]);
      client.setReady(room.room.roomId, true);
      setMode('host');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create room';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const joinSelectedRoom = async (): Promise<void> => {
    if (!roomId) {
      setError('Select a room first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const client = await ensureConnected();
      const joined = await client.joinRoom(roomId, preferredName.trim());
      setSelfPeerId(joined.selfPeerId);
      setRoomState(joined.room);
      if (preferredName.trim()) {
        setRenameDraft(preferredName.trim());
      }
      setChatMessages([]);
      setMode('join');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to join room';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = (): void => {
    const client = clientRef.current;
    if (client && roomState) {
      client.leaveRoom(roomState.roomId);
    }
    setRoomState(null);
    setChatMessages([]);
    setSelfPeerId('');
  };

  const sendChat = (): void => {
    if (!roomState) {
      return;
    }
    const text = chatText.trim();
    if (!text) {
      return;
    }
    try {
      clientRef.current?.sendChat(roomState.roomId, text);
      setChatText('');
    } catch {
      setError('Not connected');
    }
  };

  const toggleReady = (): void => {
    if (!roomState) {
      return;
    }
    const self = roomState.players.find((p) => p.peerId === selfPeerId);
    if (!self) {
      return;
    }
    try {
      clientRef.current?.setReady(roomState.roomId, !self.ready);
    } catch {
      setError('Not connected');
    }
  };

  const startMatch = (): void => {
    if (!roomState) {
      return;
    }
    try {
      clientRef.current?.startMatch(roomState.roomId);
    } catch {
      setError('Not connected');
    }
  };

  const self = roomState?.players.find((p) => p.peerId === selfPeerId) ?? null;
  const isHost = Boolean(self?.isHost);
  const readyCount = roomState?.players.filter((p) => p.ready).length ?? 0;
  const liveNameByPeerId = new Map((roomState?.players ?? []).map((p) => [p.peerId, p.name]));

  return (
    <div className="screen panel lan-screen">
      <h2>LAN Multiplayer</h2>

      {!roomState && (
        <>
          <div className="row">
            <button onClick={() => setMode('host')} disabled={busy}>Host LAN Game</button>
            <button onClick={() => setMode('join')} disabled={busy}>Join LAN Game</button>
          </div>

          <label>
            Host Endpoint
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="192.168.1.10:8787" />
          </label>
          <label>
            Preferred Name (optional)
            <input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} maxLength={16} placeholder="Used when you host/join" />
          </label>

          {mode === 'host' && (
            <>
              <label>
                Room Name
                <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={32} />
              </label>
              <div className="row">
                <button onClick={createRoom} disabled={busy}>Create Room</button>
                <button onClick={onBack} disabled={busy}>Back</button>
              </div>
            </>
          )}

          {mode === 'join' && (
            <>
              <div className="row">
                <button onClick={onBack} disabled={busy}>Back</button>
              </div>
              <div className="room-list">
                {busy && <p>Searching rooms...</p>}
                {!busy && rooms.length === 0 && <p>No rooms found.</p>}
                {rooms.map((room) => (
                  <label key={room.roomId} className="room-row">
                    <input
                      type="radio"
                      name="lan-room"
                      checked={roomId === room.roomId}
                      onChange={() => setRoomId(room.roomId)}
                    />
                    <span>
                      {room.roomName} ({room.players}/{room.maxPlayers}) - Host: {room.hostName}
                    </span>
                  </label>
                ))}
              </div>
              <button onClick={joinSelectedRoom} disabled={busy || !roomId}>Join Selected Room</button>
            </>
          )}
        </>
      )}

      {roomState && (
        <>
          <p>
            Room: <strong>{roomState.roomName}</strong> ({roomState.players.length}/{roomState.maxPlayers})
          </p>
          <div className="grid">
            {roomState.players.map((player) => (
              <div className="player-card" key={player.peerId}>
                <strong>{player.name}</strong>
                <span>{player.isHost ? 'Host' : 'Client'}</span>
                <span>{player.ready ? 'Ready' : 'Not Ready'}</span>
              </div>
            ))}
          </div>

          <div className="row">
            <button onClick={toggleReady}>{self?.ready ? 'Unready' : 'Ready'}</button>
            {isHost && (
              <button onClick={startMatch} disabled={readyCount < 2}>Start Match</button>
            )}
            <button onClick={leaveRoom}>Leave Room</button>
          </div>
          <div className="row">
            <label>
              Display Name
              <input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} maxLength={16} />
            </label>
          </div>

          <div className="chat-box">
            <div className="chat-log">
              {chatMessages.length === 0 && <p>No chat yet.</p>}
              {chatMessages.map((msg, idx) => (
                <p key={`${msg.peerId}-${msg.at}-${idx}`}>
                  <strong>{liveNameByPeerId.get(msg.peerId) ?? msg.name}:</strong> {msg.text}
                </p>
              ))}
            </div>
            <div className="row">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                maxLength={200}
                placeholder="Message"
              />
              <button onClick={sendChat}>Send</button>
            </div>
          </div>
        </>
      )}

      <p className="subtitle">LAN-only mode: no room code or password required.</p>
      {!roomState && <p className="subtitle">Unnamed joins are auto-labeled Player1, Player2, ... in join order.</p>}
      {connected && !roomState && <p>Connected to signaling server.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

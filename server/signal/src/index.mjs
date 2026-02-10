import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 5 * 60 * 1000;
const MAX_PLAYERS_DEFAULT = 10;
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** @typedef {{socket: import('node:net').Socket, closed:boolean}} PeerSocket */

/** @type {Map<string, PeerSocket>} */
const peers = new Map();
/** @type {Map<string, {roomId:string, roomName:string, status:'lobby'|'in-game', maxPlayers:number, createdAt:number, lastActiveAt:number, players:Array<{peerId:string,name:string,ready:boolean,isHost:boolean}>}>} */
const rooms = new Map();
/** @type {Map<string, string>} */
const peerToRoom = new Map();

let peerCounter = 1;

function makePeerId() {
  return `peer-${peerCounter++}`;
}

function makeRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  if (len < 126) {
    const header = Buffer.from([0x81, len]);
    return Buffer.concat([header, payload]);
  }
  if (len < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([header, payload]);
}

function sendRaw(peer, obj) {
  if (!peer || peer.closed || peer.socket.destroyed) {
    return;
  }
  peer.socket.write(encodeTextFrame(JSON.stringify(obj)));
}

function send(peer, type, payload, requestId) {
  const out = { type, payload };
  if (requestId) {
    out.requestId = requestId;
  }
  sendRaw(peer, out);
}

function sendError(peer, code, message, requestId) {
  send(peer, 'error', { code, message }, requestId);
}

function roomSummary(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostName: room.players.find((p) => p.isHost)?.name ?? 'Host',
    players: room.players.length,
    maxPlayers: room.maxPlayers,
    status: room.status,
  };
}

function roomState(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    status: room.status,
    maxPlayers: room.maxPlayers,
    players: room.players,
  };
}

function broadcastRoomState(room) {
  const payload = { room: roomState(room) };
  for (const player of room.players) {
    const peer = peers.get(player.peerId);
    if (peer) {
      send(peer, 'room.state', payload);
    }
  }
}

function removePeer(peerId) {
  const roomId = peerToRoom.get(peerId);
  peerToRoom.delete(peerId);
  peers.delete(peerId);
  if (!roomId) {
    return;
  }
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  room.players = room.players.filter((p) => p.peerId !== peerId);
  room.lastActiveAt = Date.now();
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return;
  }
  if (!room.players.some((p) => p.isHost)) {
    room.players[0].isHost = true;
  }
  broadcastRoomState(room);
}

function findPlayer(room, peerId) {
  return room.players.find((p) => p.peerId === peerId);
}

function defaultPlayerNameForRoom(room) {
  const namedCount = room.players.filter((p) => typeof p.name === 'string' && p.name.trim().length > 0).length;
  return `Player${namedCount + 1}`;
}

function handleMessage(peerId, msg) {
  const peer = peers.get(peerId);
  if (!peer) {
    return;
  }

  const type = msg?.type;
  const requestId = msg?.requestId;
  const payload = msg?.payload ?? {};

  if (type === 'room.list.request') {
    const list = [...rooms.values()]
      .filter((room) => room.status === 'lobby' && room.players.length < room.maxPlayers)
      .map((room) => roomSummary(room));
    send(peer, 'room.list.response', { rooms: list }, requestId);
    return;
  }

  if (type === 'room.create') {
    const roomName = typeof payload.roomName === 'string' && payload.roomName.trim() ? payload.roomName.trim() : 'LAN Room';
    const hostNameInput = typeof payload.hostName === 'string' ? payload.hostName.trim().slice(0, 16) : '';
    const hostName = hostNameInput || 'Player1';
    const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS_DEFAULT, Number(payload.maxPlayers || MAX_PLAYERS_DEFAULT)));

    const roomId = makeRoomId();
    const room = {
      roomId,
      roomName,
      status: 'lobby',
      maxPlayers,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      players: [{ peerId, name: hostName, ready: true, isHost: true }],
    };

    peerToRoom.set(peerId, roomId);
    rooms.set(roomId, room);

    send(peer, 'room.created', { selfPeerId: peerId, room: roomState(room) }, requestId);
    return;
  }

  if (type === 'room.join') {
    const roomId = String(payload.roomId || '');
    const room = rooms.get(roomId);
    if (!room) {
      send(peer, 'room.not_found', { roomId }, requestId);
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      send(peer, 'room.full', { roomId, currentPlayers: room.players.length, maxPlayers: room.maxPlayers }, requestId);
      return;
    }
    if (room.status !== 'lobby') {
      sendError(peer, 'forbidden', 'Match already started', requestId);
      return;
    }
    const playerNameInput = typeof payload.playerName === 'string' ? payload.playerName.trim().slice(0, 16) : '';
    const playerName = playerNameInput || defaultPlayerNameForRoom(room);

    peerToRoom.set(peerId, roomId);
    room.players.push({ peerId, name: playerName, ready: false, isHost: false });
    room.lastActiveAt = Date.now();
    send(peer, 'room.joined', { selfPeerId: peerId, room: roomState(room) }, requestId);
    broadcastRoomState(room);
    return;
  }

  if (type === 'room.leave') {
    removePeer(peerId);
    return;
  }

  const roomId = peerToRoom.get(peerId);
  if (!roomId) {
    sendError(peer, 'bad_request', 'You are not in a room', requestId);
    return;
  }
  const room = rooms.get(roomId);
  if (!room) {
    sendError(peer, 'room_not_found', 'Room no longer exists', requestId);
    return;
  }
  const player = findPlayer(room, peerId);
  if (!player) {
    sendError(peer, 'forbidden', 'Unknown player', requestId);
    return;
  }

  if (type === 'peer.ready') {
    player.ready = Boolean(payload.ready);
    room.lastActiveAt = Date.now();
    broadcastRoomState(room);
    return;
  }

  if (type === 'peer.rename') {
    const nextNameInput = typeof payload.name === 'string' ? payload.name.trim().slice(0, 16) : '';
    player.name = nextNameInput || defaultPlayerNameForRoom(room);
    room.lastActiveAt = Date.now();
    for (const recipient of room.players) {
      const target = peers.get(recipient.peerId);
      if (target) {
        send(target, 'peer.rename', { peerId, roomId, name: player.name });
      }
    }
    broadcastRoomState(room);
    return;
  }

  if (type === 'chat.msg') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      return;
    }
    const msgPayload = {
      roomId,
      peerId,
      name: player.name,
      text: text.slice(0, 200),
      at: Date.now(),
    };
    for (const recipient of room.players) {
      const target = peers.get(recipient.peerId);
      if (target) {
        send(target, 'chat.msg', msgPayload);
      }
    }
    return;
  }

  if (type === 'match.start') {
    if (!player.isHost) {
      sendError(peer, 'forbidden', 'Only host can start match');
      return;
    }
    const forceStart = Boolean(payload.forceStart);
    const readyCount = room.players.filter((p) => p.ready).length;
    if (!forceStart && readyCount < 2) {
      sendError(peer, 'bad_request', 'Need at least 2 ready players');
      return;
    }
    room.status = 'in-game';
    room.lastActiveAt = Date.now();
    const startPayload = { roomId, startedAt: Date.now() };
    for (const recipient of room.players) {
      const target = peers.get(recipient.peerId);
      if (target) {
        send(target, 'match.start', startPayload);
      }
    }
    broadcastRoomState(room);
    return;
  }

  if (type === 'game.input') {
    if (player.isHost) {
      sendError(peer, 'forbidden', 'Host does not send game.input');
      return;
    }
    const host = room.players.find((p) => p.isHost);
    if (!host) {
      sendError(peer, 'room_not_found', 'Host unavailable');
      return;
    }
    const hostPeer = peers.get(host.peerId);
    if (!hostPeer) {
      sendError(peer, 'room_not_found', 'Host socket unavailable');
      return;
    }
    send(hostPeer, 'game.input', { peerId, data: payload });
    return;
  }

  if (type === 'shop.buy' || type === 'shop.sell' || type === 'shop.done') {
    if (player.isHost) {
      sendError(peer, 'forbidden', 'Host should apply shop actions locally');
      return;
    }
    const host = room.players.find((p) => p.isHost);
    if (!host) {
      sendError(peer, 'room_not_found', 'Host unavailable');
      return;
    }
    const hostPeer = peers.get(host.peerId);
    if (!hostPeer) {
      sendError(peer, 'room_not_found', 'Host socket unavailable');
      return;
    }
    send(hostPeer, type, {
      peerId,
      roomId,
      ...(type === 'shop.done'
        ? { done: Boolean(payload.done) }
        : { weaponId: String(payload.weaponId || '') }),
    });
    return;
  }

  if (type === 'game.snapshot') {
    if (!player.isHost) {
      sendError(peer, 'forbidden', 'Only host can send snapshots');
      return;
    }
    room.lastActiveAt = Date.now();
    for (const recipient of room.players) {
      if (recipient.peerId === peerId) {
        continue;
      }
      const target = peers.get(recipient.peerId);
      if (target) {
        send(target, 'game.snapshot', payload);
      }
    }
    return;
  }

  sendError(peer, 'bad_request', `Unknown type: ${type}`);
}

function parseFrames(peerId, chunkState, data) {
  chunkState.buffer = Buffer.concat([chunkState.buffer, data]);

  while (chunkState.buffer.length >= 2) {
    const b0 = chunkState.buffer[0];
    const b1 = chunkState.buffer[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;

    if (len === 126) {
      if (chunkState.buffer.length < offset + 2) {
        return;
      }
      len = chunkState.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (chunkState.buffer.length < offset + 8) {
        return;
      }
      const bigLen = chunkState.buffer.readBigUInt64BE(offset);
      if (bigLen > BigInt(Number.MAX_SAFE_INTEGER)) {
        removePeer(peerId);
        return;
      }
      len = Number(bigLen);
      offset += 8;
    }

    const maskExtra = masked ? 4 : 0;
    if (chunkState.buffer.length < offset + maskExtra + len) {
      return;
    }

    let payload = chunkState.buffer.subarray(offset + maskExtra, offset + maskExtra + len);
    if (masked) {
      const mask = chunkState.buffer.subarray(offset, offset + 4);
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i += 1) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    chunkState.buffer = chunkState.buffer.subarray(offset + maskExtra + len);

    if (opcode === 0x8) {
      removePeer(peerId);
      return;
    }
    if (opcode === 0x9) {
      const peer = peers.get(peerId);
      if (peer && !peer.closed && !peer.socket.destroyed) {
        // pong
        const pong = Buffer.from([0x8a, 0x00]);
        peer.socket.write(pong);
      }
      continue;
    }
    if (opcode !== 0x1) {
      continue;
    }

    try {
      const msg = JSON.parse(payload.toString('utf8'));
      handleMessage(peerId, msg);
    } catch {
      const peer = peers.get(peerId);
      if (peer) {
        sendError(peer, 'bad_request', 'Invalid JSON payload');
      }
    }
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, peers: peers.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ];
  socket.write(headers.join('\r\n'));

  const peerId = makePeerId();
  peers.set(peerId, { socket, closed: false });
  const chunkState = { buffer: Buffer.alloc(0) };

  socket.on('data', (data) => {
    parseFrames(peerId, chunkState, data);
  });

  socket.on('close', () => {
    const peer = peers.get(peerId);
    if (peer) {
      peer.closed = true;
    }
    removePeer(peerId);
  });

  socket.on('error', () => {
    const peer = peers.get(peerId);
    if (peer) {
      peer.closed = true;
    }
    removePeer(peerId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.players.length === 0 || now - room.lastActiveAt > ROOM_TTL_MS) {
      for (const p of room.players) {
        peerToRoom.delete(p.peerId);
      }
      rooms.delete(roomId);
    }
  }
}, 30_000).unref();

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`scorched-signal listening on :${PORT}`);
});

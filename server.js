import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const rooms = new Map();
const ensureRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { hostSeat: null, started: false, maxPlayers: 4, seats: {}, gameState: null });
  }
  return rooms.get(roomId);
};

const publicState = (room) => ({ hostSeat: room.hostSeat, started: room.started, maxPlayers: room.maxPlayers, seats: room.seats, gameState: room.gameState });
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (d) => { data += d; });
  req.on('end', () => {
    try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
  });
});

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/join') {
    const { roomId, playerName, seatToken, preferredSeat } = await readBody(req);
    if (!roomId) return json(res, 400, { error: 'roomId required' });
    const room = ensureRoom(roomId);
    let seatIndex = null;
    if (seatToken) {
      for (const [idx, seat] of Object.entries(room.seats)) if (seat.token === seatToken) seatIndex = Number(idx);
    }
    if (seatIndex === null) {
      const preferred = Number(preferredSeat);
      if (Number.isInteger(preferred) && preferred >= 0 && preferred < room.maxPlayers && !room.seats[preferred]) seatIndex = preferred;
      else for (let i = 0; i < room.maxPlayers; i += 1) if (!room.seats[i]) { seatIndex = i; break; }
      if (seatIndex === null) return json(res, 409, { error: 'Room is full' });
      room.seats[seatIndex] = { name: (playerName || `Player ${seatIndex + 1}`).slice(0, 24), token: crypto.randomUUID(), connected: true, lastSeen: Date.now() };
    } else {
      room.seats[seatIndex].connected = true;
      room.seats[seatIndex].lastSeen = Date.now();
      if (playerName) room.seats[seatIndex].name = playerName.slice(0, 24);
    }
    if (room.hostSeat === null) room.hostSeat = seatIndex;
    return json(res, 200, { seatIndex, seatToken: room.seats[seatIndex].token, state: publicState(room) });
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const roomId = url.searchParams.get('roomId');
    if (!roomId) return json(res, 400, { error: 'roomId required' });
    const room = ensureRoom(roomId);
    return json(res, 200, { state: publicState(room) });
  }

  if (req.method === 'POST' && url.pathname === '/api/ping') {
    const { roomId, seatToken } = await readBody(req);
    const room = rooms.get(roomId);
    if (room) for (const seat of Object.values(room.seats)) if (seat.token === seatToken) { seat.connected = true; seat.lastSeen = Date.now(); }
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/set-max') {
    const { roomId, seatToken, maxPlayers } = await readBody(req);
    const room = rooms.get(roomId);
    if (!room) return json(res, 404, { error: 'room not found' });
    const host = room.seats[room.hostSeat];
    if (!host || host.token !== seatToken || room.started || ![2, 3, 4].includes(maxPlayers) || Object.keys(room.seats).length > maxPlayers) return json(res, 403, { error: 'forbidden' });
    room.maxPlayers = maxPlayers;
    return json(res, 200, { state: publicState(room) });
  }

  if (req.method === 'POST' && url.pathname === '/api/start') {
    const { roomId, seatToken } = await readBody(req);
    const room = rooms.get(roomId);
    if (!room) return json(res, 404, { error: 'room not found' });
    const host = room.seats[room.hostSeat];
    const count = Object.keys(room.seats).length;
    if (!host || host.token !== seatToken || count < 2 || count > 4) return json(res, 403, { error: 'forbidden' });
    room.started = true;
    return json(res, 200, { state: publicState(room) });
  }

  if (req.method === 'POST' && url.pathname === '/api/sync') {
    const { roomId, seatToken, state } = await readBody(req);
    const room = rooms.get(roomId);
    if (!room || !room.started) return json(res, 404, { error: 'room not found' });
    let matchedSeat = null;
    for (const [idx, seat] of Object.entries(room.seats)) if (seat.token === seatToken) matchedSeat = Number(idx);
    if (matchedSeat === null) return json(res, 403, { error: 'forbidden' });
    room.gameState = state;
    room.seats[matchedSeat].lastSeen = Date.now();
    room.seats[matchedSeat].connected = true;
    return json(res, 200, { ok: true });
  }

  // static
  const filePath = url.pathname === '/' ? path.join(distDir, 'index.html') : path.join(distDir, url.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
  } else {
    json(res, 404, { error: 'not found' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const seat of Object.values(room.seats)) {
      if (now - (seat.lastSeen || 0) > 15000) seat.connected = false;
    }
  }
}, 5000);

server.listen(process.env.PORT || 3000, () => console.log('Server running'));

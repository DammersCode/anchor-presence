// Room-broadcast relay with reference-side size, rate, and room limits.
function limitFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const PORT = limitFromEnv("PORT", 8787);
const MAX_ROOM_SOCKETS = limitFromEnv("RELAY_MAX_ROOM_SOCKETS", 128);
const MAX_TOTAL_SOCKETS = limitFromEnv("RELAY_MAX_TOTAL_SOCKETS", 10_000);
const MAX_MESSAGE_BYTES = limitFromEnv("MAX_MESSAGE_BYTES", 32 * 1024);
const RATE_CAPACITY = limitFromEnv("RATE_CAPACITY", 40);
const RATE_REFILL_PER_SECOND = limitFromEnv("RATE_REFILL_PER_SECOND", 20);

const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;
const encoder = new TextEncoder();

type SocketData = {
  room: string;
  tokens: number;
  lastRefill: number;
};

type RoomSocket = Bun.ServerWebSocket<SocketData>;

const rooms = new Map<string, Set<RoomSocket>>();
let totalSockets = 0;

function roomFor(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("room");
  const fromPath = url.pathname.replace(/^\/+|\/+$/g, "");
  return (fromQuery || fromPath || "main").slice(0, 256);
}

function messageByteLength(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  if (message.length > MAX_MESSAGE_BYTES) return message.length;
  if (message.length * 3 <= MAX_MESSAGE_BYTES) return message.length;
  return encoder.encode(message).byteLength;
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const room = roomFor(req);
    if (server.upgrade(req, { data: { room, tokens: RATE_CAPACITY, lastRefill: Date.now() } })) return;
    return new Response("WebSocket relay: upgrade required", { status: 426 });
  },
  websocket: {
    open(ws: RoomSocket) {
      if (totalSockets >= MAX_TOTAL_SOCKETS) {
        ws.close(SERVER_FULL_CODE, "server full");
        return;
      }
      const sockets = rooms.get(ws.data.room);
      if (sockets && sockets.size >= MAX_ROOM_SOCKETS) {
        ws.close(ROOM_FULL_CODE, "room full");
        return;
      }
      const room = sockets ?? new Set<RoomSocket>();
      room.add(ws);
      rooms.set(ws.data.room, room);
      totalSockets += 1;
    },
    message(ws: RoomSocket, message: string | ArrayBuffer) {
      const sockets = rooms.get(ws.data.room);
      if (!sockets?.has(ws)) return;

      const now = Date.now();
      const elapsedMs = now - ws.data.lastRefill;
      if (elapsedMs > 0) {
        ws.data.tokens = Math.min(RATE_CAPACITY, ws.data.tokens + (elapsedMs / 1000) * RATE_REFILL_PER_SECOND);
        ws.data.lastRefill = now;
      }
      if (ws.data.tokens < 1) return;
      ws.data.tokens -= 1;

      if (messageByteLength(message) > MAX_MESSAGE_BYTES) return;

      for (const peer of sockets) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(message);
      }
    },
    close(ws: RoomSocket) {
      const sockets = rooms.get(ws.data.room);
      if (!sockets?.has(ws)) return;
      sockets.delete(ws);
      if (sockets.size === 0) rooms.delete(ws.data.room);
      totalSockets -= 1;
    },
  },
});

console.log(`relay listening on :${PORT}`);

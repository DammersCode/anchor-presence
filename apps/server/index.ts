// Room-broadcast relay with reference-side size, rate, room, origin, and liveness limits.
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
const SLOW_PEER_SOFT_BYTES = limitFromEnv("RELAY_SLOW_PEER_SOFT_BYTES", 1024 * 1024);
const SLOW_PEER_HARD_BYTES = limitFromEnv("RELAY_SLOW_PEER_HARD_BYTES", 8 * 1024 * 1024);
const SLOW_PEER_RESUME_BYTES = limitFromEnv("RELAY_SLOW_PEER_RESUME_BYTES", 512 * 1024);
const PING_INTERVAL_MS = 30_000;
const LIVENESS_LIMIT_MS = 60_000;
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN ?? "";

const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;
const SLOW_PEER_CODE = 4003;
const ORIGIN_REJECTED_CODE = 4004;
const LIVENESS_CODE = 4005;
const AUTH_REJECTED_CODE = 4006;

const encoder = new TextEncoder();

type SocketData = {
  room: string;
  origin: string;
  tokens: number;
  lastRefill: number;
  lastPong: number;
  skipped: boolean;
  authOk: boolean;
};

type RoomSocket = Bun.ServerWebSocket<SocketData>;

const rooms = new Map<string, Set<RoomSocket>>();
const allowedOrigins = new Set(
  (process.env.RELAY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
);
let totalSockets = 0;

function roomFor(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("room");
  const fromPath = url.pathname.replace(/^\/+|\/+$/g, "");
  return (fromQuery || fromPath || "main").slice(0, 256);
}

// Opt-in room auth: when AUTH_TOKEN is set, the upgrade must carry a matching `token` query param.
function authOkFor(req: Request): boolean {
  if (AUTH_TOKEN === "") return true;
  return new URL(req.url).searchParams.get("token") === AUTH_TOKEN;
}

function messageByteLength(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  if (message.length > MAX_MESSAGE_BYTES) return message.length;
  if (message.length * 3 <= MAX_MESSAGE_BYTES) return message.length;
  return encoder.encode(message).byteLength;
}

export type SlowPeerAction = "send" | "skip" | "close";

export function slowPeerAction(
  bufferedAmount: number,
  skipped: boolean,
  softBytes: number,
  hardBytes: number,
  resumeBytes: number,
): SlowPeerAction {
  if (bufferedAmount > hardBytes) return "close";
  if (skipped) return bufferedAmount < resumeBytes ? "send" : "skip";
  return bufferedAmount > softBytes ? "skip" : "send";
}

if (typeof Bun !== "undefined" && import.meta.main) {
  Bun.serve({
    port: PORT,
    fetch(req, server) {
      const room = roomFor(req);
      const origin = req.headers.get("origin") ?? "";
      const authOk = authOkFor(req);
      if (
        server.upgrade(req, {
          data: {
            room,
            origin,
            tokens: RATE_CAPACITY,
            lastRefill: Date.now(),
            lastPong: Date.now(),
            skipped: false,
            authOk,
          },
        })
      )
        return;
      return new Response("WebSocket relay: upgrade required", { status: 426 });
    },
    websocket: {
      open(ws: RoomSocket) {
        if (allowedOrigins.size > 0 && !allowedOrigins.has(ws.data.origin)) {
          ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
          return;
        }
        if (!ws.data.authOk) {
          ws.close(AUTH_REJECTED_CODE, "invalid token");
          return;
        }
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
          ws.data.tokens = Math.min(
            RATE_CAPACITY,
            ws.data.tokens + (elapsedMs / 1000) * RATE_REFILL_PER_SECOND,
          );
          ws.data.lastRefill = now;
        }
        if (ws.data.tokens < 1) return;
        ws.data.tokens -= 1;

        if (messageByteLength(message) > MAX_MESSAGE_BYTES) return;

        for (const peer of sockets) {
          if (peer === ws || peer.readyState !== WebSocket.OPEN) continue;
          const action = slowPeerAction(
            peer.getBufferedAmount(),
            peer.data.skipped,
            SLOW_PEER_SOFT_BYTES,
            SLOW_PEER_HARD_BYTES,
            SLOW_PEER_RESUME_BYTES,
          );
          if (action === "close") {
            peer.close(SLOW_PEER_CODE, "slow peer");
            continue;
          }
          peer.data.skipped = action === "skip";
          if (action === "skip") continue;
          peer.send(message);
        }
      },
      pong(ws: RoomSocket) {
        ws.data.lastPong = Date.now();
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

  setInterval(() => {
    const now = Date.now();
    for (const sockets of rooms.values()) {
      for (const peer of sockets) {
        if (peer.readyState !== WebSocket.OPEN) continue;
        if (now - peer.data.lastPong >= LIVENESS_LIMIT_MS) {
          peer.close(LIVENESS_CODE, "liveness timeout");
          continue;
        }
        peer.ping();
      }
    }
  }, PING_INTERVAL_MS);

  console.log(`relay listening on :${PORT}`);
}

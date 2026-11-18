// Room-broadcast relay with reference-side size, rate, room, origin, and liveness limits.
import { timingSafeEqual } from "node:crypto";

function limitFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const PORT = limitFromEnv("PORT", 8787);
const MAX_ROOM_SOCKETS = limitFromEnv("RELAY_MAX_ROOM_SOCKETS", 64);
const MAX_TOTAL_SOCKETS = limitFromEnv("RELAY_MAX_TOTAL_SOCKETS", 10_000);
const MAX_MESSAGE_BYTES = limitFromEnv("MAX_MESSAGE_BYTES", 32 * 1024);
const RATE_CAPACITY = limitFromEnv("RATE_CAPACITY", 80);
const RATE_REFILL_PER_SECOND = limitFromEnv("RATE_REFILL_PER_SECOND", 40);
const SLOW_PEER_SOFT_BYTES = limitFromEnv("RELAY_SLOW_PEER_SOFT_BYTES", 1024 * 1024);
const SLOW_PEER_HARD_BYTES = limitFromEnv("RELAY_SLOW_PEER_HARD_BYTES", 8 * 1024 * 1024);
// Bun drops frames above the soft watermark, so a buffer only passes the hard limit when one frame can bridge the gap
const HARD_LIMIT_REACHABLE = SLOW_PEER_HARD_BYTES < SLOW_PEER_SOFT_BYTES + MAX_MESSAGE_BYTES;
const PING_INTERVAL_MS = 30_000;
const LIVENESS_LIMIT_MS = 60_000;
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN ?? "";

const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;
const SLOW_PEER_CODE = 4003;
const INVALID_ROOM_CODE = 4007;
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
  authOk: boolean;
  roomInvalid: boolean;
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

const ROOM_CHARSET = /^[A-Za-z0-9_-]+$/;

// null means the name is not a valid room name: the relay refuses the connection instead of merging it into `main`
function roomFor(req: Request): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("room");
  const fromPath = url.pathname.replace(/^\/+|\/+$/g, "");
  const candidate = fromQuery || fromPath || "main";
  return candidate.length <= 256 && ROOM_CHARSET.test(candidate) ? candidate : null;
}

// Opt-in room auth: when AUTH_TOKEN is set, the upgrade must carry a matching `token` query param.
function authOkFor(req: Request): boolean {
  if (AUTH_TOKEN === "") return true;
  const provided = new URL(req.url).searchParams.get("token") ?? "";
  return timingSafeEqualString(provided, AUTH_TOKEN);
}

// constant-time compare guards against timing side-channels; unequal lengths compare padded copies.
function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length, 1);
  const aPadded = new Uint8Array(length);
  const bPadded = new Uint8Array(length);
  aPadded.set(aBytes);
  bPadded.set(bBytes);
  return timingSafeEqual(aPadded, bPadded) && aBytes.length === bBytes.length;
}

function messageByteLength(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  if (message.length > MAX_MESSAGE_BYTES) return message.length;
  if (message.length * 3 <= MAX_MESSAGE_BYTES) return message.length;
  return encoder.encode(message).byteLength;
}

export function closePeerAboveHardLimit(
  peer: Pick<RoomSocket, "getBufferedAmount" | "close">,
  hardBytes = SLOW_PEER_HARD_BYTES,
): boolean {
  if (peer.getBufferedAmount() <= hardBytes) return false;
  peer.close(SLOW_PEER_CODE, "slow peer");
  return true;
}

if (typeof Bun !== "undefined" && import.meta.main) {
  Bun.serve({
    port: PORT,
    fetch(req, server) {
      const parsedRoom = roomFor(req);
      const room = parsedRoom ?? "main";
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
            authOk,
            roomInvalid: parsedRoom === null,
          },
        })
      )
        return;
      return new Response("WebSocket relay: upgrade required", { status: 426 });
    },
    websocket: {
      maxPayloadLength: Math.max(MAX_MESSAGE_BYTES * 4, 1024 * 1024),
      // Bun drops a published frame for a subscriber buffered above this soft watermark
      backpressureLimit: SLOW_PEER_SOFT_BYTES,
      open(ws: RoomSocket) {
        if (allowedOrigins.size > 0 && !allowedOrigins.has(ws.data.origin)) {
          ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
          return;
        }
        if (!ws.data.authOk) {
          ws.close(AUTH_REJECTED_CODE, "invalid token");
          return;
        }
        if (ws.data.roomInvalid) {
          ws.close(INVALID_ROOM_CODE, "invalid room");
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
        ws.subscribe(ws.data.room);
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

        // a result of 0 (dropped) or -1 (backpressure) means at least one subscriber is behind
        if (ws.publish(ws.data.room, message) > 0 || !HARD_LIMIT_REACHABLE) return;
        for (const peer of sockets) if (peer !== ws) closePeerAboveHardLimit(peer);
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
        if (peer.readyState !== WebSocket.OPEN || closePeerAboveHardLimit(peer)) continue;
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

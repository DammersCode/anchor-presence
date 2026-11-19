// Room-broadcast relay with reference-side size, rate, room, origin, and liveness limits.
import {
  bindIdentity,
  demoIdentityOptions,
  newConnectionId,
  originAllowed,
  parseToken,
  safeAuthCheck,
  tokenAuthCheck,
  UNBINDABLE_FRAME_CLOSE,
  type AuthCheck,
  type AuthIdentity,
} from "../../examples/_shared/relay-guard";

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
  identity?: AuthIdentity;
  connectionId: string;
  roomInvalid: boolean;
};

type RoomSocket = Bun.ServerWebSocket<SocketData>;

const allowedOrigins = new Set(
  (process.env.RELAY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
);
const ROOM_CHARSET = /^[A-Za-z0-9_-]+$/;

// null means the name is not a valid room name: the relay refuses the connection instead of merging it into `main`
function roomFor(req: Request): string | null {
  const url = new URL(req.url);
  const rooms = url.searchParams.getAll("room");
  if (rooms.length > 1) return null;
  const fromQuery = rooms[0];
  const fromPath = url.pathname.replace(/^\/+|\/+$/g, "");
  const candidate = fromQuery || fromPath || "main";
  return candidate.length <= 256 && ROOM_CHARSET.test(candidate) ? candidate : null;
}

function messageByteLength(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  if (message.length > MAX_MESSAGE_BYTES) return message.length;
  if (message.length * 3 <= MAX_MESSAGE_BYTES) return message.length;
  return encoder.encode(message).byteLength;
}

/** Refills the token bucket from a monotonic `now` in milliseconds; a backward step refills nothing but keeps refilling after it. */
export function refillBucket(
  bucket: { tokens: number; lastRefill: number },
  now: number,
  capacity = RATE_CAPACITY,
  refillPerSecond = RATE_REFILL_PER_SECOND,
): void {
  const elapsedMs = Math.max(0, now - bucket.lastRefill);
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs / 1000) * refillPerSecond);
  bucket.lastRefill = now;
}

export function closePeerAboveHardLimit(
  peer: Pick<RoomSocket, "getBufferedAmount" | "close">,
  hardBytes = SLOW_PEER_HARD_BYTES,
): boolean {
  if (peer.getBufferedAmount() <= hardBytes) return false;
  peer.close(SLOW_PEER_CODE, "slow peer");
  return true;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`createReferenceRelay: ${name} must be a positive integer, received ${value}`);
  }
  return value;
}

export type ReferenceRelayOptions = {
  authCheck?: AuthCheck;
  /** Overrides `RELAY_MAX_ROOM_SOCKETS`. */
  maxRoomSockets?: number;
  /** Overrides `RELAY_MAX_TOTAL_SOCKETS`. */
  maxTotalSockets?: number;
};

/** Starts the relay on `port`. `authCheck` defaults to the `RELAY_AUTH_TOKEN` check; an identity result binds each frame to that identity. */
export function createReferenceRelay(port: number, options: ReferenceRelayOptions = {}) {
  const authCheck = safeAuthCheck(options.authCheck ?? tokenAuthCheck(AUTH_TOKEN));
  const maxRoomSockets = positiveInteger("maxRoomSockets", options.maxRoomSockets ?? MAX_ROOM_SOCKETS);
  const maxTotalSockets = positiveInteger("maxTotalSockets", options.maxTotalSockets ?? MAX_TOTAL_SOCKETS);
  const rooms = new Map<string, Set<RoomSocket>>();
  let totalSockets = 0;
  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const parsedRoom = roomFor(req);
      const room = parsedRoom ?? "main";
      const origin = req.headers.get("origin") ?? "";
      const token = parseToken(new URL(req.url).searchParams.getAll("token"));
      // origin and room are checked before the hook runs, so a refused request never drives an expensive hook
      const authResult =
        token === null || parsedRoom === null || !originAllowed(allowedOrigins, origin)
          ? false
          : await authCheck({ token, room, origin, headers: Object.fromEntries(req.headers) });
      if (
        server.upgrade(req, {
          data: {
            room,
            origin,
            tokens: RATE_CAPACITY,
            lastRefill: performance.now(),
            lastPong: performance.now(),
            authOk: authResult !== false,
            identity: typeof authResult === "object" ? authResult : undefined,
            connectionId: newConnectionId(),
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
        if (!originAllowed(allowedOrigins, ws.data.origin)) {
          ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
          return;
        }
        if (ws.data.roomInvalid) {
          ws.close(INVALID_ROOM_CODE, "invalid room");
          return;
        }
        if (!ws.data.authOk) {
          ws.close(AUTH_REJECTED_CODE, "invalid token");
          return;
        }
        if (totalSockets >= maxTotalSockets) {
          ws.close(SERVER_FULL_CODE, "server full");
          return;
        }
        const sockets = rooms.get(ws.data.room);
        if (sockets && sockets.size >= maxRoomSockets) {
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

        refillBucket(ws.data, performance.now());
        if (ws.data.tokens < 1) return;
        ws.data.tokens -= 1;

        if (messageByteLength(message) > MAX_MESSAGE_BYTES) return;

        let outgoing: string | ArrayBuffer | Uint8Array = message;
        if (ws.data.identity !== undefined) {
          const bound = bindIdentity(
            typeof message === "string" ? message : new Uint8Array(message),
            ws.data.identity,
            ws.data.connectionId,
          );
          if (bound === null) {
            ws.close(UNBINDABLE_FRAME_CLOSE.code, UNBINDABLE_FRAME_CLOSE.reason);
            return;
          }
          outgoing = bound;
        }

        // a result of 0 (dropped) or -1 (backpressure) means at least one subscriber is behind
        if (ws.publish(ws.data.room, outgoing) > 0 || !HARD_LIMIT_REACHABLE) return;
        for (const peer of sockets) if (peer !== ws) closePeerAboveHardLimit(peer);
      },
      pong(ws: RoomSocket) {
        ws.data.lastPong = performance.now();
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

  const pinger = setInterval(() => {
    const now = performance.now();
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

  return {
    url: `http://localhost:${server.port}`,
    close: () => {
      clearInterval(pinger);
      return server.stop(true);
    },
  };
}

export function startReferenceRelay(options: ReferenceRelayOptions = {}) {
  const relay = createReferenceRelay(PORT, options);
  console.log(`relay listening on :${PORT}`);
  return relay;
}

if (typeof Bun !== "undefined" && import.meta.main) startReferenceRelay(demoIdentityOptions());

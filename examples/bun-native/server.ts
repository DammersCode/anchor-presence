// Bun.serve WebSocket relay with topics/pub-sub. Same security baseline as apps/server.
import {
  allowedOriginsFromEnv,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  tokenAuthCheck,
} from "../_shared/relay-guard";

export type BunRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: (token: string) => boolean;
};

type SocketData = {
  room: string;
  origin: string;
  authOk: boolean;
  rateLimiter: RateLimiter;
};

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;

/**
 * Creates a Bun-native relay. Rooms are Bun pub-sub topics: `ws.publish` fans out to every other
 * subscriber without a room map. Bun's pub-sub API gives no per-subscriber buffered-amount, so
 * this example has no slow-peer backpressure; see the README for the tradeoff.
 */
export function createBunRelay(port: number, options: BunRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 40);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 20);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 128);
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? "");

  const roomSizes = new Map<string, number>();

  const server = Bun.serve<SocketData>({
    port,
    fetch(req, srv) {
      const url = new URL(req.url);
      const room = sanitizeRoomName(url.searchParams.get("room"));
      const origin = req.headers.get("origin") ?? "";
      const authOk = authCheck(url.searchParams.get("token") ?? "");
      if (
        srv.upgrade(req, {
          data: { room, origin, authOk, rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond) },
        })
      )
        return;
      return new Response("WebSocket relay: upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        if (!originAllowed(allowedOrigins, ws.data.origin)) {
          ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
          return;
        }
        if (!ws.data.authOk) {
          ws.close(AUTH_REJECTED_CODE, "invalid token");
          return;
        }
        const size = roomSizes.get(ws.data.room) ?? 0;
        if (size >= maxRoomSockets) {
          ws.close(ROOM_FULL_CODE, "room full");
          return;
        }
        roomSizes.set(ws.data.room, size + 1);
        ws.subscribe(ws.data.room);
      },
      message(ws, message) {
        if (!ws.data.rateLimiter.tryConsume()) return;
        if (messageByteLength(message, maxMessageBytes) > maxMessageBytes) return;
        // ws.publish (not server.publish) excludes the sender from the topic fan-out.
        ws.publish(ws.data.room, message);
      },
      close(ws) {
        const size = roomSizes.get(ws.data.room) ?? 1;
        if (size <= 1) roomSizes.delete(ws.data.room);
        else roomSizes.set(ws.data.room, size - 1);
      },
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    close: async () => {
      server.stop(true);
    },
  };
}

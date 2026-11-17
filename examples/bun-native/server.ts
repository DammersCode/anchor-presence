// Bun.serve WebSocket relay with topics/pub-sub.
import {
  allowedOriginsFromEnv,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  safeAuthCheck,
  tokenAuthCheck,
  type AuthCheck,
} from "../_shared/relay-guard";

export type BunRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  maxSockets?: number;
  /** Seconds without a message or a pong before Bun closes the socket. Bun sends a ping before it closes. */
  idleTimeoutSeconds?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: AuthCheck;
};

type SocketData = {
  room: string;
  origin: string;
  authOk: boolean;
  admitted: boolean;
  rateLimiter: RateLimiter;
};

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;

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
  const maxSockets = options.maxSockets ?? limitFromEnv(process.env.RELAY_MAX_TOTAL_SOCKETS, 10_000);
  const idleTimeoutSeconds =
    options.idleTimeoutSeconds ?? limitFromEnv(process.env.RELAY_IDLE_TIMEOUT_SECONDS, 60);
  const slowPeerHardBytes = limitFromEnv(process.env.RELAY_SLOW_PEER_HARD_BYTES, 8 * 1024 * 1024);
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = safeAuthCheck(options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? ""));

  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);

  const server = Bun.serve<SocketData>({
    port,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const room = sanitizeRoomName(url.searchParams.get("room"));
      const origin = req.headers.get("origin") ?? "";
      const authOk = await authCheck({
        token: url.searchParams.get("token") ?? "",
        room,
        origin,
        headers: Object.fromEntries(req.headers),
      });
      if (
        srv.upgrade(req, {
          data: {
            room,
            origin,
            authOk,
            admitted: false,
            rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond),
          },
        })
      )
        return;
      return new Response("WebSocket relay: upgrade required", { status: 426 });
    },
    websocket: {
      idleTimeout: idleTimeoutSeconds,
      sendPings: true,
      backpressureLimit: slowPeerHardBytes,
      closeOnBackpressureLimit: true,
      open(ws) {
        if (!originAllowed(allowedOrigins, ws.data.origin)) {
          ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
          return;
        }
        if (!ws.data.authOk) {
          ws.close(AUTH_REJECTED_CODE, "invalid token");
          return;
        }
        const admission = limits.admit(ws.data.room);
        if (admission !== "ok") {
          ws.close(admission === "server full" ? SERVER_FULL_CODE : ROOM_FULL_CODE, admission);
          return;
        }
        ws.data.admitted = true;
        ws.subscribe(ws.data.room);
      },
      message(ws, message) {
        if (!ws.data.rateLimiter.tryConsume()) return;
        if (messageByteLength(message, maxMessageBytes) > maxMessageBytes) return;
        // ws.publish (not server.publish) excludes the sender from the topic fan-out.
        ws.publish(ws.data.room, message);
      },
      close(ws) {
        if (ws.data.admitted) limits.release(ws.data.room);
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

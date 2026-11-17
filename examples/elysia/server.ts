// Elysia `.ws()` route on Bun, using Elysia's own topic pub-sub (same model as the Bun relay example).
import { Elysia, t } from "elysia";
import {
  allowedOriginsFromEnv,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  tokenAuthCheck,
  type AuthCheck,
} from "../_shared/relay-guard";

export type ElysiaRelayOptions = {
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

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;

type ConnectionState = { rateLimiter: RateLimiter };

/**
 * Creates an Elysia relay on Bun. Rooms are Elysia/Bun pub-sub topics, `ws.publish` excludes the
 * sender. Bun's pub-sub gives no per-subscriber buffered-amount, so this example has no slow-peer
 * backpressure; see the README for the tradeoff.
 */
export function createElysiaRelay(port: number, options: ElysiaRelayOptions = {}) {
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
  const authCheck = options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? "");

  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);
  const connectionState = new WeakMap<object, ConnectionState>();

  const app = new Elysia({
    websocket: {
      idleTimeout: idleTimeoutSeconds,
      sendPings: true,
      backpressureLimit: slowPeerHardBytes,
      closeOnBackpressureLimit: true,
    },
  }).ws("/", {
    query: t.Object({ room: t.Optional(t.String()), token: t.Optional(t.String()) }),
    async open(ws) {
      const { room: rawRoom, token } = ws.data.query;
      const headers = ws.data.headers as Record<string, string | undefined>;
      const origin = headers.origin ?? "";
      if (!originAllowed(allowedOrigins, origin)) {
        ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
        return;
      }
      const room = sanitizeRoomName(rawRoom);
      if (!(await authCheck({ token: token ?? "", room, origin, headers }))) {
        ws.close(AUTH_REJECTED_CODE, "invalid token");
        return;
      }
      const admission = limits.admit(room);
      if (admission !== "ok") {
        ws.close(admission === "server full" ? SERVER_FULL_CODE : ROOM_FULL_CODE, admission);
        return;
      }
      connectionState.set(ws.raw, { rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond) });
      ws.subscribe(room);
    },
    message(ws, message) {
      const state = connectionState.get(ws.raw);
      if (!state) return;
      if (!state.rateLimiter.tryConsume()) return;

      // Elysia parses a JSON text frame into an object, which has no byteLength; measure its text form
      const payload =
        message instanceof ArrayBuffer || ArrayBuffer.isView(message) || typeof message === "string"
          ? message
          : JSON.stringify(message);
      if (messageByteLength(payload, maxMessageBytes) > maxMessageBytes) return;

      ws.publish(sanitizeRoomName(ws.data.query.room), payload);
    },
    close(ws) {
      const room = sanitizeRoomName(ws.data.query.room);
      if (connectionState.delete(ws.raw)) limits.release(room);
    },
  });

  app.listen(port);

  return {
    url: `http://localhost:${port}`,
    app,
    close: () => app.stop(),
  };
}

// The client types its Eden treaty against this, so a wrong query parameter is a compile error.
export type ElysiaRelayApp = ReturnType<typeof createElysiaRelay>["app"];

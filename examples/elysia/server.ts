// Elysia `.ws()` route on Bun, using Elysia's own topic pub-sub (same model as the Bun relay example).
import type { ServerWebSocket } from "bun";
import { Elysia, t } from "elysia";
import {
  allowedOriginsFromEnv,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  INVALID_ROOM_CODE,
  bindIdentity,
  UNBINDABLE_FRAME_CLOSE,
  newConnectionId,
  parseRoom,
  parseToken,
  type AuthIdentity,
  safeAuthCheck,
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
  /** Auth hook. Default: the `RELAY_AUTH_TOKEN` check, which admits everyone when the variable is unset. */
  authCheck?: AuthCheck;
};

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;

type ConnectionState = {
  rateLimiter: RateLimiter;
  identity: AuthIdentity | undefined;
  connectionId: string;
};

/**
 * Creates an Elysia relay on Bun. Rooms are Elysia/Bun pub-sub topics, `ws.publish` excludes the
 * sender. Bun closes a receiver whose buffer passes `RELAY_SLOW_PEER_HARD_BYTES` but cannot skip a
 * send for it; see the README for the tradeoff.
 */
export function createElysiaRelay(port: number, options: ElysiaRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 80);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 40);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 64);
  const maxSockets = options.maxSockets ?? limitFromEnv(process.env.RELAY_MAX_TOTAL_SOCKETS, 10_000);
  const idleTimeoutSeconds =
    options.idleTimeoutSeconds ?? limitFromEnv(process.env.RELAY_IDLE_TIMEOUT_SECONDS, 60);
  const slowPeerHardBytes = limitFromEnv(process.env.RELAY_SLOW_PEER_HARD_BYTES, 8 * 1024 * 1024);
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = safeAuthCheck(options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? ""));

  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);
  const connectionState = new WeakMap<object, ConnectionState>();

  const app = new Elysia({
    websocket: {
      idleTimeout: idleTimeoutSeconds,
      maxPayloadLength: Math.max(maxMessageBytes * 4, 1024 * 1024),
      sendPings: true,
      backpressureLimit: slowPeerHardBytes,
      closeOnBackpressureLimit: true,
    },
  }).ws("/", {
    query: t.Object({
      room: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      token: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    }),
    async open(ws) {
      const { room: rawRoom, token } = ws.data.query;
      const headers = ws.data.headers as Record<string, string | undefined>;
      const origin = headers.origin ?? "";
      if (!originAllowed(allowedOrigins, origin)) {
        ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
        return;
      }
      const room = parseRoom(rawRoom);
      if (room === null) {
        ws.close(INVALID_ROOM_CODE, "invalid room");
        return;
      }
      const parsedToken = parseToken(token);
      const authOk =
        parsedToken === null ? false : await authCheck({ token: parsedToken, room, origin, headers });
      // the socket can close while the hook runs; admitting it would leak a limit slot
      if (ws.raw.readyState !== 1) return;
      if (!authOk) {
        ws.close(AUTH_REJECTED_CODE, "invalid token");
        return;
      }
      const admission = limits.admit(room);
      if (admission !== "ok") {
        ws.close(admission === "server full" ? SERVER_FULL_CODE : ROOM_FULL_CODE, admission);
        return;
      }
      connectionState.set(ws.raw, {
        rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond),
        identity: typeof authOk === "object" ? authOk : undefined,
        connectionId: newConnectionId(),
      });
      ws.subscribe(room);
    },
    close(ws) {
      const room = parseRoom(ws.data.query.room) ?? "main";
      if (connectionState.delete(ws.raw)) limits.release(room);
    },
  });

  // Elysia JSON-parses a text frame before any route hook runs, so the guard sits on the raw Bun handler
  app.listen({
    port,
    websocket: {
      message(ws: ServerWebSocket<{ query: { room?: string | string[] } }>, message: string | Buffer) {
        const state = connectionState.get(ws);
        if (!state) return;
        if (!state.rateLimiter.tryConsume()) return;
        if (messageByteLength(message, maxMessageBytes) > maxMessageBytes) return;

        let outgoing: string | Uint8Array = message;
        if (state.identity !== undefined) {
          const bound = bindIdentity(
            typeof message === "string" ? message : new Uint8Array(message),
            state.identity,
            state.connectionId,
          );
          if (bound === null) {
            ws.close(UNBINDABLE_FRAME_CLOSE.code, UNBINDABLE_FRAME_CLOSE.reason);
            return;
          }
          outgoing = bound;
        }
        ws.publish(parseRoom(ws.data.query.room) ?? "main", outgoing);
      },
    },
  });

  return {
    url: `http://localhost:${port}`,
    app,
    close: () => app.stop(),
  };
}

// The client types its Eden treaty against this, so a wrong query parameter is a compile error.
export type ElysiaRelayApp = ReturnType<typeof createElysiaRelay>["app"];

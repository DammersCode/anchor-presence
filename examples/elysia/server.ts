// Elysia `.ws()` route on Bun, using Elysia's own topic pub-sub (same model as examples/bun-native).
import { Elysia } from "elysia";
import {
  allowedOriginsFromEnv,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  tokenAuthCheck,
} from "../_shared/relay-guard";

export type ElysiaRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: (token: string) => boolean;
};

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;

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
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? "");

  const roomSizes = new Map<string, number>();
  const connectionState = new WeakMap<object, ConnectionState>();

  const app = new Elysia().ws("/", {
    open(ws) {
      const query = ws.data.query as Record<string, string | undefined>;
      const room = sanitizeRoomName(query.room);
      const origin = (ws.data.headers as Record<string, string | undefined>).origin ?? "";
      if (!originAllowed(allowedOrigins, origin)) {
        ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
        return;
      }
      if (!authCheck(query.token ?? "")) {
        ws.close(AUTH_REJECTED_CODE, "invalid token");
        return;
      }
      const size = roomSizes.get(room) ?? 0;
      if (size >= maxRoomSockets) {
        ws.close(ROOM_FULL_CODE, "room full");
        return;
      }
      roomSizes.set(room, size + 1);
      connectionState.set(ws.raw, { rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond) });
      ws.subscribe(room);
    },
    message(ws, message) {
      const state = connectionState.get(ws.raw);
      if (!state) return;
      if (!state.rateLimiter.tryConsume()) return;

      const payload = typeof message === "string" ? message : (message as ArrayBuffer);
      if (messageByteLength(payload, maxMessageBytes) > maxMessageBytes) return;

      const query = ws.data.query as Record<string, string | undefined>;
      const room = sanitizeRoomName(query.room);
      ws.publish(room, payload);
    },
    close(ws) {
      const query = ws.data.query as Record<string, string | undefined>;
      const room = sanitizeRoomName(query.room);
      const size = roomSizes.get(room) ?? 1;
      if (size <= 1) roomSizes.delete(room);
      else roomSizes.set(room, size - 1);
      connectionState.delete(ws.raw);
    },
  });

  app.listen(port);

  return {
    url: `http://localhost:${port}`,
    close: () => app.stop(),
  };
}

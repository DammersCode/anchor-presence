// Hono on Bun with hono/bun's upgradeWebSocket. On plain Node, use @hono/node-ws instead.
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import {
  allowedOriginsFromEnv,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  INVALID_ROOM_CODE,
  bindIdentity,
  newConnectionId,
  parseRoom,
  parseToken,
  safeAuthCheck,
  tokenAuthCheck,
  type AuthCheck,
} from "../_shared/relay-guard";

export type HonoRelayOptions = {
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

/**
 * Creates a Hono relay on Bun. Rooms are Bun pub-sub topics on `ws.raw`, the Bun socket under Hono's `WSContext`.
 * Bun closes a receiver whose buffer passes `RELAY_SLOW_PEER_HARD_BYTES` but cannot skip a send for it;
 * see the README for the tradeoff.
 */
export function createHonoRelay(port: number, options: HonoRelayOptions = {}) {
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

  const app = new Hono();

  app.get(
    "/",
    upgradeWebSocket(async (c) => {
      const parsedRoom = parseRoom(c.req.queries("room"));
      const room = parsedRoom ?? "main";
      const connectionId = newConnectionId();
      const origin = c.req.header("origin") ?? "";
      // origin and room are checked before the hook runs, so a refused request never drives an expensive hook
      const preChecked = originAllowed(allowedOrigins, origin) && parsedRoom !== null;
      const token = parseToken(c.req.queries("token"));
      const authOk =
        preChecked && token !== null
          ? await authCheck({
              token,
              room,
              origin,
              headers: c.req.header(),
            })
          : false;
      const rateLimiter = new RateLimiter(rateCapacity, rateRefillPerSecond);
      let admitted = false;

      return {
        onOpen(_evt, ws) {
          if (!originAllowed(allowedOrigins, origin)) {
            ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
            return;
          }
          if (parsedRoom === null) {
            ws.close(INVALID_ROOM_CODE, "invalid room");
            return;
          }
          if (!authOk) {
            ws.close(AUTH_REJECTED_CODE, "invalid token");
            return;
          }
          const admission = limits.admit(room);
          if (admission !== "ok") {
            ws.close(admission === "server full" ? SERVER_FULL_CODE : ROOM_FULL_CODE, admission);
            return;
          }
          admitted = true;
          (ws.raw as ServerWebSocket).subscribe(room);
        },
        onMessage(evt, ws) {
          if (!admitted) return;
          if (!rateLimiter.tryConsume()) return;

          const data = evt.data;
          const message = typeof data === "string" ? data : (data as ArrayBuffer);
          if (messageByteLength(message, maxMessageBytes) > maxMessageBytes) return;

          let outgoing: string | ArrayBuffer | Uint8Array<ArrayBuffer> = message;
          if (typeof authOk === "object") {
            const bound = bindIdentity(
              typeof message === "string" ? message : new Uint8Array(message),
              authOk,
              connectionId,
            );
            if (bound === null) return;
            outgoing = bound;
          }
          // the raw socket's publish (not server.publish) excludes the sender from the topic fan-out
          (ws.raw as ServerWebSocket).publish(room, outgoing);
        },
        onClose() {
          if (admitted) limits.release(room);
          admitted = false;
        },
      };
    }),
  );

  const server = Bun.serve({
    port,
    fetch: app.fetch,
    websocket: {
      ...websocket,
      idleTimeout: idleTimeoutSeconds,
      sendPings: true,
      maxPayloadLength: Math.max(maxMessageBytes * 4, 1024 * 1024),
      backpressureLimit: slowPeerHardBytes,
      closeOnBackpressureLimit: true,
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    close: () => server.stop(true),
  };
}

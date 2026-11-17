// Hono on Bun with hono/bun's upgradeWebSocket. On plain Node, use @hono/node-ws instead.
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import type { WSContext } from "hono/ws";
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
  slowPeerAction,
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
  slowPeerSoftBytes?: number;
  slowPeerHardBytes?: number;
  slowPeerResumeBytes?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: AuthCheck;
};

type RawSocket = { readyState: number; getBufferedAmount(): number };

const AUTH_REJECTED_CODE = 4006;
const ORIGIN_REJECTED_CODE = 4004;
const ROOM_FULL_CODE = 4001;
const SERVER_FULL_CODE = 4002;
const SLOW_PEER_CODE = 4003;
const OPEN = 1;

type RoomEntry = { ws: WSContext; raw: RawSocket };

/**
 * Creates a Hono relay on Bun. Rooms are `Set<RoomEntry>` maps keyed by the raw Bun socket:
 * hono wraps every event in a fresh `WSContext`, so `ws.raw` (not `ws` itself) is the stable identity.
 */
export function createHonoRelay(port: number, options: HonoRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 40);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 20);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 128);
  const maxSockets = options.maxSockets ?? limitFromEnv(process.env.RELAY_MAX_TOTAL_SOCKETS, 10_000);
  const idleTimeoutSeconds =
    options.idleTimeoutSeconds ?? limitFromEnv(process.env.RELAY_IDLE_TIMEOUT_SECONDS, 60);
  const slowPeerSoftBytes =
    options.slowPeerSoftBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_SOFT_BYTES, 1024 * 1024);
  const slowPeerHardBytes =
    options.slowPeerHardBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_HARD_BYTES, 8 * 1024 * 1024);
  const slowPeerResumeBytes =
    options.slowPeerResumeBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_RESUME_BYTES, 512 * 1024);
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = safeAuthCheck(options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? ""));

  const rooms = new Map<string, Set<RoomEntry>>();
  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);
  const skipped = new WeakMap<RawSocket, boolean>();

  const app = new Hono();

  app.get(
    "/",
    upgradeWebSocket(async (c) => {
      const parsedRoom = parseRoom(c.req.query("room"));
      const room = parsedRoom ?? "main";
      const connectionId = newConnectionId();
      const origin = c.req.header("origin") ?? "";
      const authOk = await authCheck({
        token: c.req.query("token") ?? "",
        room,
        origin,
        headers: c.req.header(),
      });
      const rateLimiter = new RateLimiter(rateCapacity, rateRefillPerSecond);

      return {
        onOpen(_evt, ws) {
          const raw = ws.raw as RawSocket;
          if (!originAllowed(allowedOrigins, origin)) {
            ws.close(ORIGIN_REJECTED_CODE, "origin not allowed");
            return;
          }
          if (!authOk) {
            ws.close(AUTH_REJECTED_CODE, "invalid token");
            return;
          }
          if (parsedRoom === null) {
            ws.close(INVALID_ROOM_CODE, "invalid room");
            return;
          }
          const admission = limits.admit(room);
          if (admission !== "ok") {
            ws.close(admission === "server full" ? SERVER_FULL_CODE : ROOM_FULL_CODE, admission);
            return;
          }
          const sockets = rooms.get(room) ?? new Set<RoomEntry>();
          sockets.add({ ws, raw });
          rooms.set(room, sockets);
        },
        onMessage(evt, ws) {
          const sockets = rooms.get(room);
          if (!sockets) return;
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

          const senderRaw = ws.raw as RawSocket;
          for (const peer of sockets) {
            if (peer.raw === senderRaw || peer.raw.readyState !== OPEN) continue;
            const bufferedAmount = peer.raw.getBufferedAmount();
            const action = slowPeerAction(
              bufferedAmount,
              skipped.get(peer.raw) ?? false,
              slowPeerSoftBytes,
              slowPeerHardBytes,
              slowPeerResumeBytes,
            );
            if (action === "close") {
              peer.ws.close(SLOW_PEER_CODE, "slow peer");
              continue;
            }
            skipped.set(peer.raw, action === "skip");
            if (action === "skip") continue;
            peer.ws.send(outgoing);
          }
        },
        onClose(_evt, ws) {
          const sockets = rooms.get(room);
          if (!sockets) return;
          const raw = ws.raw as RawSocket;
          for (const peer of sockets) {
            if (peer.raw === raw) {
              sockets.delete(peer);
              skipped.delete(peer.raw);
              limits.release(room);
              break;
            }
          }
          if (sockets.size === 0) rooms.delete(room);
        },
      };
    }),
  );

  const server = Bun.serve({
    port,
    fetch: app.fetch,
    websocket: { ...websocket, idleTimeout: idleTimeoutSeconds, sendPings: true },
  });

  return {
    url: `http://localhost:${server.port}`,
    close: async () => {
      server.stop(true);
    },
  };
}

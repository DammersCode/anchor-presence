// Node `ws` on node:http. Same security baseline as the Bun relay example.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import {
  allowedOriginsFromEnv,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  slowPeerAction,
  safeAuthCheck,
  tokenAuthCheck,
  type AuthCheck,
} from "../_shared/relay-guard";

export type NodeWsRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  maxSockets?: number;
  /** Seconds a socket may leave a ping unanswered. The relay pings every half of it and terminates silent sockets. */
  idleTimeoutSeconds?: number;
  slowPeerSoftBytes?: number;
  slowPeerHardBytes?: number;
  slowPeerResumeBytes?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: AuthCheck;
};

type SocketState = {
  room: string;
  rateLimiter: RateLimiter;
  skipped: boolean;
  alive: boolean;
};

const SLOW_PEER_CODE = 4003;

/** Creates a relay on Node's `ws` package. Rooms are plain `Set<WebSocket>` maps, closed and swept on disconnect. */
export function createNodeWsRelay(port: number, options: NodeWsRelayOptions = {}) {
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

  const rooms = new Map<string, Set<WebSocket>>();
  const state = new WeakMap<WebSocket, SocketState>();

  const httpServer: Server = createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" }).end("WebSocket relay: upgrade required");
  });
  // A hard ceiling well above maxMessageBytes: ws closes the socket at this limit (can't "drop and
  // keep going" mid-frame), so the real drop-don't-crash size check runs in the message handler below.
  const wss = new WebSocketServer({ noServer: true, maxPayload: Math.max(maxMessageBytes * 4, 1024 * 1024) });

  // accept the upgrade, then close with a code, like the reference relay: a destroyed socket reads as 1006
  const refuse = (req: IncomingMessage, socket: Duplex, head: Buffer, code: number, reason: string) => {
    wss.handleUpgrade(req, socket, head, (ws) => ws.close(code, reason));
  };

  httpServer.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin ?? "";
    if (!originAllowed(allowedOrigins, origin)) {
      refuse(req, socket, head, 4004, "origin not allowed");
      return;
    }
    const authRoom = sanitizeRoomName(url.searchParams.get("room"));
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(", ") : value,
      ]),
    );
    if (!(await authCheck({ token: url.searchParams.get("token") ?? "", room: authRoom, origin, headers }))) {
      refuse(req, socket, head, 4006, "invalid token");
      return;
    }
    if (wss.clients.size >= maxSockets) {
      refuse(req, socket, head, 4002, "server full");
      return;
    }
    const room = sanitizeRoomName(url.searchParams.get("room"));
    const sockets = rooms.get(room);
    if (sockets && sockets.size >= maxRoomSockets) {
      refuse(req, socket, head, 4001, "room full");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, room);
    });
  });

  wss.on("connection", (ws: WebSocket, room: string) => {
    const socketState: SocketState = {
      room,
      rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond),
      skipped: false,
      alive: true,
    };
    state.set(ws, socketState);
    const sockets = rooms.get(room) ?? new Set<WebSocket>();
    sockets.add(ws);
    rooms.set(room, sockets);

    // A frame over ws's own maxPayload ceiling errors instead of closing cleanly; swallow it here.
    ws.on("error", () => {
      ws.terminate();
    });

    ws.on("pong", () => {
      socketState.alive = true;
    });

    ws.on("message", (data, isBinary) => {
      if (!socketState.rateLimiter.tryConsume()) return;
      const message = isBinary ? (data as Buffer) : data.toString();
      if (messageByteLength(message, maxMessageBytes) > maxMessageBytes) return;

      const peers = rooms.get(room);
      if (!peers) return;
      for (const peer of peers) {
        if (peer === ws || peer.readyState !== peer.OPEN) continue;
        const peerState = state.get(peer);
        if (!peerState) continue;
        const action = slowPeerAction(
          peer.bufferedAmount,
          peerState.skipped,
          slowPeerSoftBytes,
          slowPeerHardBytes,
          slowPeerResumeBytes,
        );
        if (action === "close") {
          peer.close(SLOW_PEER_CODE, "slow peer");
          continue;
        }
        peerState.skipped = action === "skip";
        if (action === "skip") continue;
        peer.send(data, { binary: isBinary });
      }
    });

    ws.on("close", () => {
      const sockets2 = rooms.get(room);
      sockets2?.delete(ws);
      if (sockets2?.size === 0) rooms.delete(room);
      state.delete(ws);
    });
  });

  const heartbeat = setInterval(
    () => {
      for (const client of wss.clients) {
        const clientState = state.get(client);
        if (!clientState?.alive) {
          client.terminate();
          continue;
        }
        clientState.alive = false;
        client.ping();
      }
    },
    (idleTimeoutSeconds * 1000) / 2,
  );
  wss.on("close", () => clearInterval(heartbeat));

  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://localhost:${actualPort}`,
        close: () =>
          new Promise<void>((resolveClose) => {
            wss.close(() => {
              httpServer.close(() => resolveClose());
            });
            for (const client of wss.clients) client.terminate();
          }),
      });
    });
  });
}

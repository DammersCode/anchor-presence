// Node `ws` on node:http. Same security baseline as apps/server and examples/bun-native.
import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  allowedOriginsFromEnv,
  limitFromEnv,
  messageByteLength,
  originAllowed,
  RateLimiter,
  sanitizeRoomName,
  slowPeerAction,
  tokenAuthCheck,
} from "../_shared/relay-guard";

export type NodeWsRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  slowPeerSoftBytes?: number;
  slowPeerHardBytes?: number;
  slowPeerResumeBytes?: number;
  allowedOrigins?: Set<string>;
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: (token: string) => boolean;
};

type SocketState = {
  room: string;
  rateLimiter: RateLimiter;
  skipped: boolean;
};

const SLOW_PEER_CODE = 4003;

/** Creates a relay on Node's `ws` package. Rooms are plain `Set<WebSocket>` maps, closed and swept on disconnect. */
export function createNodeWsRelay(port: number, options: NodeWsRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 40);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 20);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 128);
  const slowPeerSoftBytes =
    options.slowPeerSoftBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_SOFT_BYTES, 1024 * 1024);
  const slowPeerHardBytes =
    options.slowPeerHardBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_HARD_BYTES, 8 * 1024 * 1024);
  const slowPeerResumeBytes =
    options.slowPeerResumeBytes ?? limitFromEnv(process.env.RELAY_SLOW_PEER_RESUME_BYTES, 512 * 1024);
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS);
  const authCheck = options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? "");

  const rooms = new Map<string, Set<WebSocket>>();
  const state = new WeakMap<WebSocket, SocketState>();

  const httpServer: Server = createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" }).end("WebSocket relay: upgrade required");
  });
  // A hard ceiling well above maxMessageBytes: ws closes the socket at this limit (can't "drop and
  // keep going" mid-frame), so the real drop-don't-crash size check runs in the message handler below.
  const wss = new WebSocketServer({ noServer: true, maxPayload: Math.max(maxMessageBytes * 4, 1024 * 1024) });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin ?? "";
    if (!originAllowed(allowedOrigins, origin)) {
      socket.destroy();
      return;
    }
    if (!authCheck(url.searchParams.get("token") ?? "")) {
      socket.destroy();
      return;
    }
    const room = sanitizeRoomName(url.searchParams.get("room"));
    const sockets = rooms.get(room);
    if (sockets && sockets.size >= maxRoomSockets) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, room);
    });
  });

  wss.on("connection", (ws: WebSocket, room: string) => {
    state.set(ws, { room, rateLimiter: new RateLimiter(rateCapacity, rateRefillPerSecond), skipped: false });
    const sockets = rooms.get(room) ?? new Set<WebSocket>();
    sockets.add(ws);
    rooms.set(room, sockets);

    // A frame over ws's own maxPayload ceiling errors instead of closing cleanly; swallow it here.
    ws.on("error", () => {
      ws.terminate();
    });

    ws.on("message", (data, isBinary) => {
      const socketState = state.get(ws);
      if (!socketState) return;
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

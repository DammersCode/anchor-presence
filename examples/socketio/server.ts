import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  allowedOriginsFromEnv,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
  RateLimiter,
  sanitizeRoomName,
  tokenAuthCheck,
} from "../_shared/relay-guard";

export type SocketIoRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  maxSockets?: number;
  allowedOrigins?: string[];
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: (token: string) => boolean;
};

/** Minimal room-broadcast relay: no message inspection beyond size, no persistence. */
export function createSocketIoRelay(port: number, options: SocketIoRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 40);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 20);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 128);
  const maxSockets = options.maxSockets ?? limitFromEnv(process.env.RELAY_MAX_SOCKETS, 10_000);
  const allowedOrigins = options.allowedOrigins ?? [
    ...allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS),
  ];
  const authCheck = options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? "");

  const httpServer = createServer();
  const io = new Server(httpServer, {
    // Empty allowlist (dev default) falls back to "*"; socket.io's cors option has no "allow everyone" sentinel.
    cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : "*" },
    maxHttpBufferSize: maxMessageBytes,
  });

  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);

  io.use((socket, next) => {
    if (!authCheck(String(socket.handshake.query.token ?? ""))) {
      next(new Error("invalid token"));
      return;
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    const room = sanitizeRoomName(String(socket.handshake.query.room ?? ""));
    if (limits.admit(room) !== "ok") {
      socket.disconnect(true);
      return;
    }
    socket.join(room);

    const rateLimiter = new RateLimiter(rateCapacity, rateRefillPerSecond);
    socket.on("presence", (data: Uint8Array) => {
      if (!rateLimiter.tryConsume()) return;
      if (messageByteLength(data, maxMessageBytes) > maxMessageBytes) return;
      socket.to(room).emit("presence", data);
    });

    socket.on("disconnect", () => {
      limits.release(room);
    });
  });

  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    httpServer.listen(port, () => {
      const address = httpServer.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://localhost:${actualPort}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            io.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}

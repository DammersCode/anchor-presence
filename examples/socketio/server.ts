import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  allowedOriginsFromEnv,
  originAllowed,
  ConnectionLimits,
  limitFromEnv,
  messageByteLength,
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

export type SocketIoRelayOptions = {
  maxMessageBytes?: number;
  rateCapacity?: number;
  rateRefillPerSecond?: number;
  maxRoomSockets?: number;
  maxSockets?: number;
  allowedOrigins?: string[];
  /** Auth hook placeholder: verify a token query param. Default accepts every token. */
  authCheck?: AuthCheck;
};

// engine.io keeps only the last value of a repeated query key; the raw URL still has them all
function rawQuery(socket: Socket, key: string): string[] {
  return new URL(socket.request.url ?? "", "http://localhost").searchParams.getAll(key);
}

/** Minimal room-broadcast relay: no message inspection beyond size, no persistence. */
export function createSocketIoRelay(port: number, options: SocketIoRelayOptions = {}) {
  const maxMessageBytes = options.maxMessageBytes ?? limitFromEnv(process.env.MAX_MESSAGE_BYTES, 32 * 1024);
  const rateCapacity = options.rateCapacity ?? limitFromEnv(process.env.RATE_CAPACITY, 80);
  const rateRefillPerSecond =
    options.rateRefillPerSecond ?? limitFromEnv(process.env.RATE_REFILL_PER_SECOND, 40);
  const maxRoomSockets = options.maxRoomSockets ?? limitFromEnv(process.env.RELAY_MAX_ROOM_SOCKETS, 64);
  const maxSockets = options.maxSockets ?? limitFromEnv(process.env.RELAY_MAX_TOTAL_SOCKETS, 10_000);
  const allowedOrigins = options.allowedOrigins ?? [
    ...allowedOriginsFromEnv(process.env.RELAY_ALLOWED_ORIGINS),
  ];
  const authCheck = safeAuthCheck(options.authCheck ?? tokenAuthCheck(process.env.RELAY_AUTH_TOKEN ?? ""));

  const httpServer = createServer();
  const io = new Server(httpServer, {
    // Empty allowlist (dev default) falls back to "*"; socket.io's cors option has no "allow everyone" sentinel.
    cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : "*" },
    maxHttpBufferSize: Math.max(maxMessageBytes * 4, 1024 * 1024),
  });

  const limits = new ConnectionLimits(maxSockets, maxRoomSockets);
  const allowlist = new Set(allowedOrigins);

  io.use(async (socket, next) => {
    const { headers } = socket.handshake;
    // a refusal here carries a code, so the client stops; an HTTP-level refusal would make it retry forever
    if (!originAllowed(allowlist, headers.origin ?? "")) {
      next(Object.assign(new Error("origin not allowed"), { data: { code: 4004 } }));
      return;
    }
    const room = parseRoom(rawQuery(socket, "room"));
    if (room === null) {
      next(Object.assign(new Error("invalid room"), { data: { code: INVALID_ROOM_CODE } }));
      return;
    }
    const token = parseToken(rawQuery(socket, "token"));
    const ok =
      token === null
        ? false
        : await authCheck({
            token,
            room,
            origin: headers.origin ?? "",
            headers: Object.fromEntries(
              Object.entries(headers).map(([name, value]) => [
                name,
                Array.isArray(value) ? value.join(", ") : value,
              ]),
            ),
          });
    if (!ok) {
      next(Object.assign(new Error("invalid token"), { data: { code: 4006 } }));
      return;
    }
    if (typeof ok === "object") socket.data.identity = ok;
    next();
  });

  // Socket.IO has no close codes: send the code first, and the transport reports it as the close code
  const refuse = (socket: Socket, code: number, reason: string) => {
    socket.emit("refused", { code, reason });
    socket.disconnect(true);
  };

  io.on("connection", (socket: Socket) => {
    const parsedRoom = parseRoom(rawQuery(socket, "room"));
    if (parsedRoom === null) {
      refuse(socket, INVALID_ROOM_CODE, "invalid room");
      return;
    }
    const room = parsedRoom;
    const identity = socket.data.identity as AuthIdentity | undefined;
    const connectionId = newConnectionId();
    const admission = limits.admit(room);
    if (admission !== "ok") {
      refuse(socket, admission === "server full" ? 4002 : 4001, admission);
      return;
    }
    // a prefix keeps a room apart from the room Socket.IO names after every socket's own id
    const ioRoom = `room:${room}`;
    socket.join(ioRoom);

    const rateLimiter = new RateLimiter(rateCapacity, rateRefillPerSecond);
    socket.on("presence", (data: unknown) => {
      if (!rateLimiter.tryConsume()) return;
      if (messageByteLength(data, maxMessageBytes) > maxMessageBytes) return;
      let outgoing = data;
      if (identity !== undefined) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
        const bound = bindIdentity(bytes, identity, connectionId);
        if (bound === null) {
          refuse(socket, UNBINDABLE_FRAME_CLOSE.code, UNBINDABLE_FRAME_CLOSE.reason);
          return;
        }
        outgoing = bound;
      }
      socket.to(ioRoom).emit("presence", outgoing);
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

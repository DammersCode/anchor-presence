import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";

/** Minimal room-broadcast relay: no message inspection, no persistence. */
export function createSocketIoRelay(port: number) {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket: Socket) => {
    const room = String(socket.handshake.query.room ?? "main");
    socket.join(room);
    socket.on("presence", (data: Uint8Array) => {
      socket.to(room).emit("presence", data);
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

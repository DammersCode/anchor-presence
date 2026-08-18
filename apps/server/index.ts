// Minimal room-broadcast relay: no message inspection, no persistence.
const PORT = Number(process.env.PORT ?? 8787);

type RoomSocket = Bun.ServerWebSocket<{ room: string }>;

const rooms = new Map<string, Set<RoomSocket>>();

function roomFor(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("room");
  const fromPath = url.pathname.replace(/^\/+|\/+$/g, "");
  return fromQuery || fromPath || "main";
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const room = roomFor(req);
    if (server.upgrade(req, { data: { room } })) return;
    return new Response("WebSocket relay: upgrade required", { status: 426 });
  },
  websocket: {
    open(ws: RoomSocket) {
      const sockets = rooms.get(ws.data.room) ?? new Set<RoomSocket>();
      sockets.add(ws);
      rooms.set(ws.data.room, sockets);
      console.log(`connect room=${ws.data.room} count=${sockets.size}`);
    },
    message(ws: RoomSocket, message) {
      const sockets = rooms.get(ws.data.room);
      if (!sockets) return;
      for (const peer of sockets) {
        if (peer !== ws) peer.send(message);
      }
    },
    close(ws: RoomSocket) {
      const sockets = rooms.get(ws.data.room);
      if (!sockets) return;
      sockets.delete(ws);
      if (sockets.size === 0) rooms.delete(ws.data.room);
      console.log(`disconnect room=${ws.data.room} count=${sockets.size}`);
    },
  },
});

console.log(`relay listening on :${PORT}`);

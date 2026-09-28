import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { io, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSocketIoRelay } from "./server";
import { createSocketIoTransport } from "./transport";

describe("Socket.IO transport integration", () => {
  let close: () => Promise<void>;
  let url: string;
  const sockets: Socket[] = [];
  const clients: PresenceClient[] = [];

  beforeEach(async () => {
    const relay = await createSocketIoRelay(0);
    url = relay.url;
    close = relay.close;
  });

  afterEach(async () => {
    for (const client of clients) client.dispose();
    for (const socket of sockets) socket.disconnect();
    clients.length = 0;
    sockets.length = 0;
    await close();
  });

  function connectClient(room: string): PresenceClient {
    const socket = io(url, { query: { room }, transports: ["websocket"] });
    sockets.push(socket);
    const client = createPresenceClient({ transport: createSocketIoTransport(socket) });
    clients.push(client);
    return client;
  }

  it("relays a presence update from one client to another in the same room", async () => {
    const clientA = connectClient("room-1");
    const clientB = connectClient("room-1");

    clientA.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });

    await vi.waitFor(
      () => {
        const snapshot = clientB.getRemoteSnapshot();
        expect(snapshot).toHaveLength(1);
        expect(snapshot[0]?.clientId).toBe(clientA.clientId);
        expect(snapshot[0]?.cursor?.anchors[0]?.u).toBe(0.5);
      },
      { timeout: 5000, interval: 25 },
    );

    const [received] = clientB.getRemoteSnapshot();
    expect(received?.session).toBe(clientA.session);
    expect(received?.sequence).toBeGreaterThanOrEqual(0);

    clientA.dispose();

    await vi.waitFor(
      () => {
        expect(clientB.getStatus()).toBe("connected");
      },
      { timeout: 5000, interval: 25 },
    );
  });
});

describe("Socket.IO relay limits", () => {
  let close: () => Promise<void>;
  let url: string;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    const relay = await createSocketIoRelay(0, { maxSockets: 1 });
    url = relay.url;
    close = relay.close;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    await close();
  });

  function connect(room: string): Socket {
    const socket = io(url, { query: { room }, transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    return socket;
  }

  function disconnectReason(socket: Socket): Promise<string> {
    return new Promise((resolve) => socket.once("disconnect", (reason) => resolve(reason)));
  }

  it("disconnects a socket above the per-process cap until a slot frees", async () => {
    const first = connect("room-1");
    await vi.waitFor(() => expect(first.connected).toBe(true), { timeout: 5000, interval: 25 });

    expect(await disconnectReason(connect("room-2"))).toBe("io server disconnect");
    expect(await disconnectReason(connect("room-3"))).toBe("io server disconnect");

    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const next = connect("room-4");
    await vi.waitFor(() => expect(next.connected).toBe(true), { timeout: 5000, interval: 25 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(next.connected).toBe(true);
  });
});

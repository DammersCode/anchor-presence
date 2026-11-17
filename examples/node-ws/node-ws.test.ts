import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeCode,
  opened,
  openUnresponsivePeer,
  type UnresponsivePeer,
} from "../_shared/relay-test-helpers";
import { createNodeWsRelay } from "./server";

describe("node-ws relay integration", () => {
  let close: () => Promise<void>;
  let url: string;
  const clients: PresenceClient[] = [];

  beforeEach(async () => {
    const relay = await createNodeWsRelay(0, { maxMessageBytes: 1024 });
    url = relay.url;
    close = relay.close;
  });

  afterEach(async () => {
    for (const client of clients) client.dispose();
    clients.length = 0;
    await close();
  });

  function connectClient(room: string): PresenceClient {
    const transport = createWebSocketTransport({
      url: `${url.replace("http", "ws")}/?room=${encodeURIComponent(room)}`,
    });
    const client = createPresenceClient({ transport });
    clients.push(client);
    transport.connect();
    return client;
  }

  it("relays a presence update from one client to another in the same room", async () => {
    const clientA = connectClient("room-1");
    const clientB = connectClient("room-1");

    await vi.waitFor(() => expect(clientA.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });
    await vi.waitFor(() => expect(clientB.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });

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
  });

  it("keeps a different room isolated from the sender's room", async () => {
    const sender = connectClient("room-a");
    const otherRoom = connectClient("room-b");

    await vi.waitFor(() => expect(sender.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });
    await vi.waitFor(() => expect(otherRoom.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });

    sender.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(otherRoom.getRemoteSnapshot()).toHaveLength(0);
  });

  it("stops relaying to a client after it disconnects", async () => {
    const clientA = connectClient("room-cleanup");
    const clientB = connectClient("room-cleanup");

    await vi.waitFor(() => expect(clientA.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });
    await vi.waitFor(() => expect(clientB.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });

    clientB.dispose();
    clients.splice(clients.indexOf(clientB), 1);

    await new Promise((resolve) => setTimeout(resolve, 200));
    clientA.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(clientA.getStatus()).toBe("connected");
  });

  it("drops an oversized frame instead of crashing the relay", async () => {
    const sender = connectClient("room-oversized");
    const receiver = connectClient("room-oversized");

    await vi.waitFor(() => expect(sender.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });
    await vi.waitFor(() => expect(receiver.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });

    sender.updateLocalCursor({ anchors: [{ id: "a".repeat(2000), u: 0.1, v: 0.1 }] });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(receiver.getRemoteSnapshot()).toHaveLength(0);
    expect(sender.getStatus()).toBe("connected");
  });
});

describe("node-ws relay limits", () => {
  let close: () => Promise<void>;
  let wsUrl: string;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    const relay = await createNodeWsRelay(0, { maxSockets: 1 });
    wsUrl = relay.url.replace("http", "ws");
    close = relay.close;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    await close();
  });

  function connect(room: string): WebSocket {
    const socket = new WebSocket(`${wsUrl}/?room=${room}`);
    sockets.push(socket);
    return socket;
  }

  it("rejects connections above the per-process cap with close code 4002 until a slot frees", async () => {
    const first = connect("room-1");
    await opened(first);

    expect(await closeCode(connect("room-2"))).toBe(4002);

    first.close();
    await closeCode(first);
    await vi.waitFor(() => opened(connect("room-3")), { timeout: 2000, interval: 50 });
  }, 10_000);
});

describe("node-ws relay liveness", () => {
  let close: () => Promise<void>;
  let port: number;
  let silent: UnresponsivePeer | undefined;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    const relay = await createNodeWsRelay(0, { idleTimeoutSeconds: 0.2 });
    port = Number(new URL(relay.url).port);
    close = relay.close;
  });

  afterEach(async () => {
    silent?.destroy();
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    await close();
  });

  it("terminates a connection that never answers a ping and keeps a responsive one", async () => {
    const responsive = new WebSocket(`ws://127.0.0.1:${port}/?room=room-1`);
    sockets.push(responsive);
    await opened(responsive);
    silent = openUnresponsivePeer(port, "room-1");
    await silent.upgraded;

    await silent.closed;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(responsive.readyState).toBe(WebSocket.OPEN);
  });
});

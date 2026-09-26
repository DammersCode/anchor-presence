import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  closeCode,
  opened,
  openUnresponsivePeer,
  spawnBunRelay,
  type SpawnedRelay,
  type UnresponsivePeer,
} from "../_shared/relay-test-helpers";

let relay: SpawnedRelay;
let port = 0;
const clients: PresenceClient[] = [];

beforeAll(async () => {
  relay = await spawnBunRelay("bun-native", { MAX_MESSAGE_BYTES: "1024" });
  port = relay.port;
}, 15_000);

afterAll(async () => {
  await relay.stop();
});

afterEach(() => {
  for (const client of clients) client.dispose();
  clients.length = 0;
});

function connectClient(room: string): PresenceClient {
  const transport = createWebSocketTransport({
    url: `ws://127.0.0.1:${port}/?room=${encodeURIComponent(room)}`,
  });
  const client = createPresenceClient({ transport });
  clients.push(client);
  transport.connect();
  return client;
}

describe("Bun-native relay integration", () => {
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

describe("Bun-native relay limits", () => {
  let limited: SpawnedRelay;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    limited = await spawnBunRelay("bun-native", { RELAY_MAX_TOTAL_SOCKETS: "1" });
  }, 15_000);

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await limited.stop();
  });

  function connect(room: string): WebSocket {
    const socket = new WebSocket(`ws://127.0.0.1:${limited.port}/?room=${room}`);
    sockets.push(socket);
    return socket;
  }

  it("rejects connections above the per-process cap with close code 4002 until a slot frees", async () => {
    const first = connect("room-1");
    await opened(first);

    expect(await closeCode(connect("room-2"))).toBe(4002);
    expect(await closeCode(connect("room-3"))).toBe(4002);

    first.close();
    await closeCode(first);
    await opened(connect("room-4"));
  });
});

describe("Bun-native relay liveness", () => {
  let lively: SpawnedRelay;
  let silent: UnresponsivePeer | undefined;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    lively = await spawnBunRelay("bun-native", { RELAY_IDLE_TIMEOUT_SECONDS: "1" });
  }, 15_000);

  afterAll(async () => {
    silent?.destroy();
    for (const socket of sockets) socket.close();
    await lively.stop();
  });

  it("closes a connection that never answers a ping and keeps a responsive one", async () => {
    const responsive = new WebSocket(`ws://127.0.0.1:${lively.port}/?room=room-1`);
    sockets.push(responsive);
    await opened(responsive);
    silent = openUnresponsivePeer(lively.port, "room-1");
    await silent.upgraded;

    await silent.closed;
    expect(responsive.readyState).toBe(WebSocket.OPEN);
  }, 20_000);
});

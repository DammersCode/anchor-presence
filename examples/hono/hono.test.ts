import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Bun.serve needs the Bun runtime: vitest's worker runs under Node, so the relay
// is spawned as a real `bun run` child process, same pattern as examples/bun-native.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("expected a numeric port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function waitForPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        attempts += 1;
        if (attempts >= 50) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryConnect, 100);
      });
    };
    tryConnect();
  });
}

let relay: ChildProcess;
let port = 0;
const clients: PresenceClient[] = [];

beforeAll(async () => {
  port = await freePort();
  relay = spawn("bun", ["run", "--cwd", "examples/hono", "relay.ts", String(port)], {
    cwd: repoRoot,
    env: { ...process.env, MAX_MESSAGE_BYTES: "1024" },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForPort(port);
}, 15_000);

afterAll(async () => {
  relay.kill();
  await new Promise((resolve) => setTimeout(resolve, 50));
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

describe("Hono relay integration", () => {
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

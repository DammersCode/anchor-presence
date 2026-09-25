import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSignalRTransport, type SignalRHarness } from "./transport";

// Real integration test: runs the actual .NET hub (PresenceHub.cs), not a mock. Skips entirely
// when the .NET SDK is not on PATH, so `bun run test` still works without .NET installed.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverDir = path.join(repoRoot, "examples/signalr/server");

function hasDotnet(): boolean {
  const result = spawnSync("dotnet", ["--version"], { stdio: "ignore", windowsHide: true });
  return result.status === 0;
}

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
        // dotnet run rebuilds on first launch; allow up to the beforeAll hook's 60s budget.
        if (attempts >= 300) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

/** Adapts a real @microsoft/signalr HubConnection to the SignalRHarness the transport expects. */
function harnessFor(connection: HubConnection): SignalRHarness {
  const statusListeners = new Set<() => void>();
  connection.onclose(() => {
    for (const listener of statusListeners) listener();
  });
  connection.onreconnecting(() => {
    for (const listener of statusListeners) listener();
  });
  connection.onreconnected(() => {
    for (const listener of statusListeners) listener();
  });

  return {
    send: (payload) => connection.send("OnPresence", payload),
    onConnected: (handler) => connection.on("PresenceReceived", handler),
    onDisconnected: () => connection.off("PresenceReceived"),
    getStatus: () => {
      switch (connection.state) {
        case "Connected":
          return "connected";
        case "Reconnecting":
          return "reconnecting";
        case "Disconnected":
          return "disconnected";
        default:
          return "connecting";
      }
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
}

const dotnetAvailable = hasDotnet();
const describeIfDotnet = dotnetAvailable ? describe : describe.skip;

let hub: ChildProcessWithoutNullStreams;
let port = 0;
const connections: HubConnection[] = [];
const clients: PresenceClient[] = [];

beforeAll(async () => {
  if (!dotnetAvailable) return;
  port = await freePort();
  hub = spawn("dotnet", ["run"], {
    cwd: serverDir,
    env: { ...process.env, ASPNETCORE_URLS: `http://localhost:${port}` },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForPort(port);
}, 60_000);

afterAll(async () => {
  if (!dotnetAvailable) return;
  hub.kill();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

afterEach(async () => {
  for (const client of clients) client.dispose();
  clients.length = 0;
  for (const connection of connections) await connection.stop();
  connections.length = 0;
});

async function connectClient(room: string): Promise<PresenceClient> {
  const connection = new HubConnectionBuilder()
    .withUrl(`http://localhost:${port}/hubs/presence?room=${encodeURIComponent(room)}`)
    .build();
  connections.push(connection);
  await connection.start();
  const { transport } = createSignalRTransport(harnessFor(connection));
  const client = createPresenceClient({ transport });
  clients.push(client);
  return client;
}

describeIfDotnet("SignalR hub integration (real .NET server)", () => {
  it("relays a presence update from one client to another in the same room", async () => {
    const clientA = await connectClient("room-1");
    const clientB = await connectClient("room-1");

    clientA.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });

    await vi.waitFor(
      () => {
        const snapshot = clientB.getRemoteSnapshot();
        expect(snapshot).toHaveLength(1);
        expect(snapshot[0]?.clientId).toBe(clientA.clientId);
        expect(snapshot[0]?.cursor?.anchors[0]?.u).toBe(0.5);
      },
      { timeout: 10_000, interval: 50 },
    );
  });

  it("keeps a different room isolated from the sender's room", async () => {
    const sender = await connectClient("room-a");
    const otherRoom = await connectClient("room-b");

    sender.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(otherRoom.getRemoteSnapshot()).toHaveLength(0);
  });

  it("drops an oversized frame instead of crashing the hub", async () => {
    const sender = await connectClient("room-oversized");
    const receiver = await connectClient("room-oversized");

    // MaximumReceiveMessageSize is 32 KiB; this payload is well over that.
    sender.updateLocalCursor({ anchors: [{ id: "a".repeat(64 * 1024), u: 0.1, v: 0.1 }] });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receiver.getRemoteSnapshot()).toHaveLength(0);
  });
});

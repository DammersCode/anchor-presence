import { createPresenceClient, type PresenceClient } from "@dammers/anchor-presence-core";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSignalRTransport } from "./transport";

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
        if (attempts >= 300) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

const dotnetAvailable = hasDotnet();
const describeIfDotnet = dotnetAvailable ? describe : describe.skip;

let hub: ChildProcess;
let port = 0;
const connections: HubConnection[] = [];
const clients: PresenceClient[] = [];

beforeAll(async () => {
  if (!dotnetAvailable) return;
  // Build first and run the dll directly: `dotnet run` leaves an orphaned child process on kill.
  const outDir = path.join(os.tmpdir(), `signalr-relay-${process.pid}`);
  const build = spawnSync("dotnet", ["build", "--nologo", "-c", "Release", "-o", outDir], {
    cwd: serverDir,
    stdio: "ignore",
    windowsHide: true,
  });
  if (build.status !== 0) throw new Error("dotnet build failed for examples/signalr/server");
  port = await freePort();
  hub = spawn("dotnet", [path.join(outDir, "SignalRRelay.dll")], {
    cwd: serverDir,
    env: { ...process.env, ASPNETCORE_URLS: `http://localhost:${port}` },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForPort(port);
}, 180_000);

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
  const transport = createSignalRTransport(connection);
  await transport.connect?.();
  const client = createPresenceClient({ transport });
  clients.push(client);
  return client;
}

describeIfDotnet("SignalR hub integration (real .NET server)", () => {
  it("aborts a connection that names an invalid room instead of merging it into main", async () => {
    const connection = new HubConnectionBuilder()
      .withUrl(`http://localhost:${port}/hubs/presence?room=${encodeURIComponent("team/a")}`)
      .build();
    connections.push(connection);
    const closed = new Promise<void>((resolve) => connection.onclose(() => resolve()));
    await connection.start().catch(() => undefined);
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 3000))]);
    expect(connection.state).toBe("Disconnected");
  });

  it("refuses a request from an origin outside the allowlist", async () => {
    const negotiate = (origin: string) =>
      fetch(`http://localhost:${port}/hubs/presence/negotiate?negotiateVersion=1`, {
        method: "POST",
        headers: { Origin: origin },
      });
    expect((await negotiate("http://evil.example")).status).toBe(403);
    expect((await negotiate("http://localhost:5173")).status).toBe(200);
  });

  it("relays a presence update from one client to another in the same room", async () => {
    const clientA = await connectClient("room-1");
    const clientB = await connectClient("room-1");

    clientA.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });

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

    sender.setLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(otherRoom.getRemoteSnapshot()).toHaveLength(0);
  });

  it("drops an oversized frame instead of crashing the hub", async () => {
    const sender = await connectClient("room-oversized");
    const receiver = await connectClient("room-oversized");

    // MaximumReceiveMessageSize is 32 KiB; this payload is well over that.
    sender.setLocalCursor({ anchors: [{ id: "a".repeat(64 * 1024), u: 0.1, v: 0.1 }] });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receiver.getRemoteSnapshot()).toHaveLength(0);
  });
});

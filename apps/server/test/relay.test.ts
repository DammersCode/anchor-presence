import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type OpenedSocket = {
  ws: WebSocket;
  closeCode: Promise<number>;
};

let hardening: ChildProcessWithoutNullStreams;
let rateLimited: ChildProcessWithoutNullStreams;
let capped: ChildProcessWithoutNullStreams;
let hardeningPort = 0;
let rateLimitedPort = 0;
let cappedPort = 0;
const sockets: WebSocket[] = [];

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

function startRelay(port: number, extraEnv: Record<string, string>): ChildProcessWithoutNullStreams {
  const child = spawn("bun", ["run", "--cwd", "apps/server", "dev"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: "ignore",
    windowsHide: true,
  });
  return child;
}

function connect(url: string): Promise<OpenedSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    (ws as { binaryType?: string }).binaryType = "arraybuffer";
    const closeCode = new Promise<number>((resolveClose) => {
      ws.onclose = (event) => resolveClose(event.code);
    });
    const timer = setTimeout(() => reject(new Error(`open timeout ${url}`)), 2000);
    ws.onopen = () => {
      clearTimeout(timer);
      sockets.push(ws);
      resolve({ ws, closeCode });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`open failed ${url}`));
    };
  });
}

function collectMessages(ws: WebSocket, ms: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    ws.onmessage = (event) => messages.push(event.data);
    setTimeout(() => resolve(messages), ms);
  });
}

beforeAll(async () => {
  hardeningPort = await freePort();
  rateLimitedPort = await freePort();
  cappedPort = await freePort();
  hardening = startRelay(hardeningPort, {
    RELAY_MAX_ROOM_SOCKETS: "3",
    MAX_MESSAGE_BYTES: "128",
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  rateLimited = startRelay(rateLimitedPort, {
    RELAY_MAX_ROOM_SOCKETS: "1000",
    MAX_MESSAGE_BYTES: "32768",
    RATE_CAPACITY: "5",
    RATE_REFILL_PER_SECOND: "1",
  });
  capped = startRelay(cappedPort, {
    RELAY_MAX_ROOM_SOCKETS: "1000",
    RELAY_MAX_TOTAL_SOCKETS: "4",
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  await Promise.all([waitForPort(hardeningPort), waitForPort(rateLimitedPort), waitForPort(cappedPort)]);
}, 10_000);

afterAll(async () => {
  for (const ws of sockets) ws.close();
  hardening.kill();
  rateLimited.kill();
  capped.kill();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("reference relay hardening", () => {
  it("broadcasts binary messages to other sockets in the same room", async () => {
    const room = randomUUID();
    const sender = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);

    const promise = collectMessages(receiver.ws, 500);
    sender.ws.send(new Uint8Array([1, 2, 3]));
    const messages = await promise;

    expect(messages).toHaveLength(1);
    expect(Array.from(new Uint8Array(messages[0] as ArrayBuffer))).toEqual([1, 2, 3]);
  });

  it("drops oversized messages", async () => {
    const room = randomUUID();
    const sender = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);

    const promise = collectMessages(receiver.ws, 300);
    sender.ws.send("x".repeat(200));
    const messages = await promise;

    expect(messages).toHaveLength(0);
  });

  it("isolates rooms", async () => {
    const roomA = randomUUID();
    const roomB = randomUUID();
    const senderA = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${roomA}`);
    const receiverA = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${roomA}`);
    const receiverB = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${roomB}`);

    const aPromise = collectMessages(receiverA.ws, 300);
    const bPromise = collectMessages(receiverB.ws, 300);
    senderA.ws.send(new Uint8Array([9]));
    const [a, b] = await Promise.all([aPromise, bPromise]);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it("closes new sockets with 4001 when a room is full", async () => {
    const room = randomUUID();
    const first = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);
    const second = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);
    const third = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);
    const fourth = await connect(`ws://127.0.0.1:${hardeningPort}/?room=${room}`);

    const code = await fourth.closeCode;
    expect(code).toBe(4001);
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
    expect(second.ws.readyState).toBe(WebSocket.OPEN);
    expect(third.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("closes new sockets with 4002 when the total socket cap is hit", async () => {
    const roomA = randomUUID();
    const roomB = randomUUID();
    const first = await connect(`ws://127.0.0.1:${cappedPort}/?room=${roomA}`);
    const second = await connect(`ws://127.0.0.1:${cappedPort}/?room=${roomA}`);
    const third = await connect(`ws://127.0.0.1:${cappedPort}/?room=${roomB}`);
    const fourth = await connect(`ws://127.0.0.1:${cappedPort}/?room=${roomB}`);
    const fifth = await connect(`ws://127.0.0.1:${cappedPort}/?room=${roomA}`);

    expect(await fifth.closeCode).toBe(4002);
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
    expect(second.ws.readyState).toBe(WebSocket.OPEN);
    expect(third.ws.readyState).toBe(WebSocket.OPEN);
    expect(fourth.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("limits burst messages per socket and refills over time", async () => {
    const room = randomUUID();
    const sender = await connect(`ws://127.0.0.1:${rateLimitedPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${rateLimitedPort}/?room=${room}`);

    const burstPromise = collectMessages(receiver.ws, 400);
    for (let i = 0; i < 20; i++) sender.ws.send(new Uint8Array([i]));
    const burst = await burstPromise;

    expect(burst.length).toBeGreaterThanOrEqual(5);
    expect(burst.length).toBeLessThanOrEqual(8);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const refillPromise = collectMessages(receiver.ws, 500);
    sender.ws.send(new Uint8Array([99]));
    const refilled = await refillPromise;

    expect(refilled.length).toBeGreaterThanOrEqual(1);
  });
});

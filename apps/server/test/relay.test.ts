import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePeerAboveHardLimit, refillBucket } from "../index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type OpenedSocket = {
  ws: WebSocket;
  closeCode: Promise<number>;
};

type RawSocket = {
  socket: net.Socket;
  frames: () => Buffer;
};

let hardening: ChildProcessWithoutNullStreams;
let rateLimited: ChildProcessWithoutNullStreams;
let capped: ChildProcessWithoutNullStreams;
let origin: ChildProcessWithoutNullStreams;
let slow: ChildProcessWithoutNullStreams;
let hardeningPort = 0;
let rateLimitedPort = 0;
let cappedPort = 0;
let originPort = 0;
let slowPort = 0;
const sockets: WebSocket[] = [];
const rawSockets: net.Socket[] = [];

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

function rawConnect(port: number, urlPath: string, originHeader: string | null): Promise<RawSocket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    rawSockets.push(socket);
    const key = randomBytes(16).toString("base64");
    const lines = [
      `GET ${urlPath} HTTP/1.1`,
      "Host: 127.0.0.1",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
    ];
    if (originHeader !== null) lines.push(`Origin: ${originHeader}`);
    let settled = false;
    let frames = Buffer.alloc(0);
    let handshakeDone = false;
    const data = (chunk: Buffer) => {
      frames = Buffer.concat([frames, chunk]);
      if (handshakeDone) return;
      const headerEnd = frames.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      handshakeDone = true;
      const status = frames.subarray(0, headerEnd).toString();
      frames = frames.subarray(headerEnd + 4);
      if (!status.includes(" 101 ")) {
        socket.destroy();
        if (!settled) {
          settled = true;
          reject(new Error(`upgrade failed: ${status}`));
        }
        return;
      }
      if (!settled) {
        settled = true;
        resolve({ socket, frames: () => frames });
      }
    };
    socket.once("connect", () => socket.write(`${lines.join("\r\n")}\r\n\r\n`));
    socket.on("data", data);
    socket.once("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function closeCodeIn(data: Buffer): number | null {
  let offset = 0;
  while (offset + 2 <= data.length) {
    const opcode = data[offset] & 0x0f;
    let length = data[offset + 1] & 0x7f;
    let header = 2;
    if (length === 126) {
      if (offset + 4 > data.length) return null;
      length = data.readUInt16BE(offset + 2);
      header = 4;
    } else if (length === 127) {
      if (offset + 10 > data.length) return null;
      length = Number(data.readBigUInt64BE(offset + 2));
      header = 10;
    }
    if (offset + header + length > data.length) return null;
    if (opcode === 0x8 && length >= 2) return data.readUInt16BE(offset + header);
    offset += header + length;
  }
  return null;
}

function awaitCloseCode(raw: RawSocket, timeoutMs = 5000): Promise<{ code: number; received: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for close frame")), timeoutMs);
    const check = () => {
      const frames = raw.frames();
      const code = closeCodeIn(frames);
      if (code === null) return;
      clearTimeout(timer);
      raw.socket.destroy();
      resolve({ code, received: frames.length });
    };
    check();
    raw.socket.on("data", check);
    raw.socket.resume();
  });
}

function collectUntil(ws: WebSocket, count: number, ms: number): Promise<number> {
  return new Promise((resolve) => {
    let received = 0;
    const timer = setTimeout(() => resolve(received), ms);
    ws.onmessage = () => {
      received += 1;
      if (received >= count) {
        clearTimeout(timer);
        resolve(received);
      }
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
  originPort = await freePort();
  slowPort = await freePort();
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
  origin = startRelay(originPort, {
    RELAY_ALLOWED_ORIGINS: "http://allowed.example",
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  slow = startRelay(slowPort, {
    RELAY_MAX_ROOM_SOCKETS: "1000",
    MAX_MESSAGE_BYTES: String(1024 * 1024),
    RATE_CAPACITY: "100000",
    RATE_REFILL_PER_SECOND: "100000",
    RELAY_SLOW_PEER_SOFT_BYTES: String(64 * 1024),
    RELAY_SLOW_PEER_HARD_BYTES: String(192 * 1024),
    RELAY_SLOW_PEER_RESUME_BYTES: String(32 * 1024),
  });
  await Promise.all([
    waitForPort(hardeningPort),
    waitForPort(rateLimitedPort),
    waitForPort(cappedPort),
    waitForPort(originPort),
    waitForPort(slowPort),
  ]);
}, 15_000);

afterAll(async () => {
  for (const ws of sockets) ws.close();
  for (const socket of rawSockets) socket.destroy();
  hardening.kill();
  rateLimited.kill();
  capped.kill();
  origin.kill();
  slow.kill();
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

  it("rejects a disallowed or missing origin with 4004 and accepts an allowed one", async () => {
    const room = randomUUID();
    const rejected = await rawConnect(originPort, `/?room=${room}`, "http://evil.example");
    expect((await awaitCloseCode(rejected)).code).toBe(4004);

    const missingOrigin = await rawConnect(originPort, `/?room=${room}`, null);
    expect((await awaitCloseCode(missingOrigin)).code).toBe(4004);

    const noOrigin = await connect(`ws://127.0.0.1:${originPort}/?room=${room}`);
    expect(await noOrigin.closeCode).toBe(4004);

    const allowed = await rawConnect(originPort, `/?room=${room}`, "http://allowed.example");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(allowed.socket.destroyed).toBe(false);
    allowed.socket.destroy();
  }, 10_000);

  it("closes a peer whose buffer is above the hard limit with 4003", () => {
    const closes: unknown[][] = [];
    const peer = (buffered: number) => ({
      getBufferedAmount: () => buffered,
      close: (...args: unknown[]) => closes.push(args),
    });
    expect(closePeerAboveHardLimit(peer(192), 192)).toBe(false);
    expect(closePeerAboveHardLimit(peer(193), 192)).toBe(true);
    expect(closes).toEqual([[4003, "slow peer"]]);
  });

  it("keeps delivering to healthy peers while a peer is stalled", async () => {
    const room = randomUUID();
    const stalled = await rawConnect(slowPort, `/?room=${room}`, null);
    stalled.socket.pause();

    const sender = await connect(`ws://127.0.0.1:${slowPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${slowPort}/?room=${room}`);

    const received = collectUntil(receiver.ws, 10, 8000);
    for (let i = 0; i < 10; i++) sender.ws.send(new Uint8Array(16 * 1024));
    const delivered = await received;

    expect(delivered).toBe(10);
    stalled.socket.destroy();
  }, 20_000);

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

  it("keeps refilling the bucket after the clock steps back", () => {
    const bucket = { tokens: 0, lastRefill: 10_000 };
    refillBucket(bucket, 5_000, 10, 2);
    expect(bucket.tokens).toBe(0);
    refillBucket(bucket, 6_000, 10, 2);
    expect(bucket.tokens).toBe(2);
  });

  it("keeps the room count per relay instance, enforces both caps and rejects invalid cap options", async () => {
    const child = spawn("bun", ["apps/server/test/two-relays-fixture.ts"], {
      cwd: repoRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    const code = await new Promise((resolve) => child.once("exit", resolve));
    expect(code).toBe(0);
  }, 15_000);
});

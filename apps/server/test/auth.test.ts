import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const AUTH_TOKEN = "s3cret t ok";

let secured: ChildProcessWithoutNullStreams;
let open: ChildProcessWithoutNullStreams;
let securedPort = 0;
let openPort = 0;
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

function connect(url: string): Promise<{ ws: WebSocket; closeCode: Promise<number> }> {
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
  securedPort = await freePort();
  openPort = await freePort();
  secured = startRelay(securedPort, {
    RELAY_AUTH_TOKEN: AUTH_TOKEN,
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  open = startRelay(openPort, {
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  await Promise.all([waitForPort(securedPort), waitForPort(openPort)]);
}, 15_000);

afterAll(async () => {
  for (const ws of sockets) ws.close();
  secured.kill();
  open.kill();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("relay token auth", () => {
  it("closes an upgrade with a missing token with 4006 when auth is enabled", async () => {
    const ws = await connect(`ws://127.0.0.1:${securedPort}/?room=${randomUUID()}`);
    expect(await ws.closeCode).toBe(4006);
  });

  it("closes an upgrade with a wrong token with 4006 when auth is enabled", async () => {
    const ws = await connect(`ws://127.0.0.1:${securedPort}/?room=${randomUUID()}&token=wrong`);
    expect(await ws.closeCode).toBe(4006);
  });

  it("accepts an upgrade with the correct token and relays messages", async () => {
    const room = randomUUID();
    const token = encodeURIComponent(AUTH_TOKEN);
    const sender = await connect(`ws://127.0.0.1:${securedPort}/?room=${room}&token=${token}`);
    const receiver = await connect(`ws://127.0.0.1:${securedPort}/?room=${room}&token=${token}`);

    const promise = collectMessages(receiver.ws, 500);
    sender.ws.send(new Uint8Array([7]));
    const messages = await promise;

    expect(messages).toHaveLength(1);
    expect(Array.from(new Uint8Array(messages[0] as ArrayBuffer))).toEqual([7]);
    expect(sender.ws.readyState).toBe(WebSocket.OPEN);
    expect(receiver.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("keeps no-auth behavior when RELAY_AUTH_TOKEN is unset, even if a token is sent", async () => {
    const room = randomUUID();
    const sender = await connect(`ws://127.0.0.1:${openPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${openPort}/?room=${room}&token=ignored`);

    const promise = collectMessages(receiver.ws, 500);
    sender.ws.send(new Uint8Array([9]));
    const messages = await promise;

    expect(messages).toHaveLength(1);
    expect(sender.ws.readyState).toBe(WebSocket.OPEN);
    expect(receiver.ws.readyState).toBe(WebSocket.OPEN);
  });
});

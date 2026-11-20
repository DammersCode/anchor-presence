import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  binaryCodec,
  createPresenceClient,
  type ConnectionStatus,
  type PresenceMessage,
  type PresenceTransport,
  type PresenceClient,
} from "@dammers/anchor-presence-core";
import { createAnchorRegistry } from "../../../packages/dom/src/registry";
import { resolveGeometry } from "../../../packages/dom/src/resolver";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let reference: ChildProcessWithoutNullStreams;
let flood: ChildProcessWithoutNullStreams;
let referencePort = 0;
let floodPort = 0;
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

async function rawUpgrade(port: number, urlPath: string): Promise<net.Socket> {
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
        resolve(socket);
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

// RFC 6455 client->server frames must be masked.
function maskedFrame(opcode: number, payload: Uint8Array): Buffer {
  const mask = randomBytes(4);
  const length = payload.length;
  let header: Buffer;
  if (length < 126) header = Buffer.from([0x80 | opcode, 0x80 | length]);
  else if (length < 65536)
    header = Buffer.from([0x80 | opcode, 0x80 | 126, (length >> 8) & 0xff, length & 0xff]);
  else {
    const extended = Buffer.alloc(8);
    extended.writeBigUInt64BE(BigInt(length));
    header = Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 127]), extended]);
  }
  const masked = Buffer.alloc(length);
  for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

// Binary frame that declares a payload longer than the bytes actually written, so the
// message is incomplete when the socket goes away.
function truncatedBinaryFrame(declaredPayload: number, actualPayload: Uint8Array): Buffer {
  const mask = randomBytes(4);
  const header = Buffer.from([0x82, 0x80 | 126, (declaredPayload >> 8) & 0xff, declaredPayload & 0xff]);
  const masked = Buffer.alloc(actualPayload.length);
  for (let i = 0; i < actualPayload.length; i++) masked[i] = actualPayload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function entryFor(client: PresenceClient, clientId: string): PresenceMessage | undefined {
  return client.getRemoteSnapshot().find((p) => p.clientId === clientId);
}

// The receiver side runs a REAL presence client on node. The client half needs a
// PresenceTransport over a raw WebSocket (the dom package's createWebSocketTransport is
// not exported for this purpose in the server project, and a local helper keeps the
// test self-contained).
class SocketTransport implements PresenceTransport {
  private readonly ws: WebSocket;
  private readonly dataListeners = new Set<(data: Uint8Array) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private status: ConnectionStatus = "connecting";

  constructor(url: string) {
    this.ws = new WebSocket(url);
    (this.ws as { binaryType?: string }).binaryType = "arraybuffer";
    this.ws.onopen = () => this.setStatus("connected");
    this.ws.onclose = () => this.setStatus("disconnected");
    this.ws.onerror = () => {
      try {
        this.ws.close();
      } catch {
        // already closing
      }
    };
    this.ws.onmessage = (event) => {
      const data = event.data;
      if (!(data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(data);
      for (const listener of this.dataListeners) listener(bytes);
    };
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
  }

  send(data: Uint8Array): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }

  subscribe(listener: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  close(): void {
    this.ws.close();
  }
}

beforeAll(async () => {
  referencePort = await freePort();
  floodPort = await freePort();
  reference = startRelay(referencePort, {
    RELAY_MAX_ROOM_SOCKETS: "1000",
    MAX_MESSAGE_BYTES: "32768",
    RATE_CAPACITY: "1000",
    RATE_REFILL_PER_SECOND: "1000",
  });
  flood = startRelay(floodPort, {
    RELAY_MAX_ROOM_SOCKETS: "1000",
    MAX_MESSAGE_BYTES: "32768",
    RATE_CAPACITY: "5",
    RATE_REFILL_PER_SECOND: "1",
  });
  await Promise.all([waitForPort(referencePort), waitForPort(floodPort)]);
}, 15_000);

afterAll(async () => {
  for (const ws of sockets) ws.close();
  for (const socket of rawSockets) socket.destroy();
  reference.kill();
  flood.kill();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("adversarial relay e2e", () => {
  it("junk frames over the real relay leave the receiver client working", async () => {
    const room = randomUUID();
    const transport = new SocketTransport(`ws://127.0.0.1:${referencePort}/?room=${room}`);
    const receiver = createPresenceClient({ transport, codec: binaryCodec, publishIntervalMs: 50 });
    await waitUntil(() => transport.getStatus() === "connected", 3000, "receiver open");

    const truncated = await rawUpgrade(referencePort, `/?room=${room}`);
    truncated.write(truncatedBinaryFrame(300, new Uint8Array(10)));
    truncated.destroy();

    const junk = await rawUpgrade(referencePort, `/?room=${room}`);
    const invalidUtf8 = new Uint8Array(32769).fill(0xff);
    const unknownVersion = binaryCodec.encode({
      version: 1,
      clientId: "junk",
      session: "s",
      sequence: 1,
      cursor: null,
    });
    unknownVersion[2] = 99;
    const valid = binaryCodec.encode({
      version: 1,
      clientId: "junk-peer",
      session: "junk-session",
      sequence: 1,
      cursor: { anchors: [{ id: "x", u: 0.1, v: 0.1 }] },
    });
    junk.write(maskedFrame(0x2, invalidUtf8));
    junk.write(maskedFrame(0x2, unknownVersion));
    junk.write(maskedFrame(0x2, valid));

    await waitUntil(
      () => entryFor(receiver, "junk-peer") !== undefined,
      3000,
      "valid message from junk peer",
    );
    expect(entryFor(receiver, "junk-peer")?.sequence).toBe(1);
    expect(receiver.getRemoteSnapshot()).toHaveLength(1);
    expect(transport.getStatus()).toBe("connected");

    receiver.dispose();
    transport.close();
    junk.destroy();
  }, 15_000);

  it("relays messages at the 32 KiB boundary and drops ones past it", async () => {
    const room = randomUUID();
    const sender = await connect(`ws://127.0.0.1:${referencePort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${referencePort}/?room=${room}`);

    const received: unknown[] = [];
    receiver.ws.onmessage = (event) => {
      received.push(event.data);
    };

    sender.ws.send(new Uint8Array(32768));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(received).toHaveLength(1);
    expect((received[0] as ArrayBuffer).byteLength).toBe(32768);

    sender.ws.send(new Uint8Array(32769));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(1);

    sender.ws.send("中".repeat(10922)); // 32766 UTF-8 bytes
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(received).toHaveLength(2);
    expect(received[1]).toBe("中".repeat(10922));

    sender.ws.send("中".repeat(10923)); // 32769 UTF-8 bytes
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(2);
    expect(receiver.ws.readyState).toBe(WebSocket.OPEN);
  }, 15_000);

  it("does not let a flooding peer starve a well-behaved peer", async () => {
    const room = randomUUID();
    const flooder = await connect(`ws://127.0.0.1:${floodPort}/?room=${room}`);
    const wellBehaved = await connect(`ws://127.0.0.1:${floodPort}/?room=${room}`);
    const receiver = await connect(`ws://127.0.0.1:${floodPort}/?room=${room}`);

    const flooderBytes: number[] = [];
    const wellBehavedBytes: number[] = [];
    receiver.ws.onmessage = (event) => {
      const byte = new Uint8Array(event.data as ArrayBuffer)[0];
      if (byte !== undefined && byte >= 0xf0) wellBehavedBytes.push(byte);
      else flooderBytes.push(byte);
    };

    for (let i = 0; i < 30; i++) flooder.ws.send(new Uint8Array([i]));
    wellBehaved.ws.send(new Uint8Array([0xf0]));
    await new Promise((resolve) => setTimeout(resolve, 500));

    await new Promise((resolve) => setTimeout(resolve, 1200));
    wellBehaved.ws.send(new Uint8Array([0xf1]));
    await new Promise((resolve) => setTimeout(resolve, 400));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    wellBehaved.ws.send(new Uint8Array([0xf2]));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(wellBehavedBytes).toEqual([0xf0, 0xf1, 0xf2]);
    expect(flooderBytes.length).toBeGreaterThanOrEqual(5);
    expect(flooderBytes.length).toBeLessThanOrEqual(8);
  }, 15_000);

  it("refuses a room name above 256 characters instead of merging it with another room", async () => {
    const longRoom = `room-${"r".repeat(300)}`;
    const refused = await connect(
      `ws://127.0.0.1:${referencePort}/?room=${encodeURIComponent(longRoom)}`,
    ).catch(() => undefined);
    expect(await refused?.closeCode).toBe(4007);

    // a name of exactly 256 characters is valid and stays its own room
    const roomA = "a".repeat(256);
    const senderA = await connect(`ws://127.0.0.1:${referencePort}/?room=${roomA}`);
    const sameRoom = await connect(`ws://127.0.0.1:${referencePort}/?room=${roomA}`);
    const received: unknown[] = [];
    sameRoom.ws.onmessage = (event) => {
      received.push(event.data);
    };
    senderA.ws.send(new Uint8Array([2]));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(1);
  }, 15_000);

  it("rejects a spoofed sequence above the cap and keeps cursors working", async () => {
    const room = randomUUID();
    const transport = new SocketTransport(`ws://127.0.0.1:${referencePort}/?room=${room}`);
    const receiver = createPresenceClient({ transport, codec: binaryCodec, publishIntervalMs: 50 });
    await waitUntil(() => transport.getStatus() === "connected", 3000, "receiver open");

    const evil = await rawUpgrade(referencePort, `/?room=${room}`);
    const spoofedId = "a"; // one byte, so the sequence uint32 sits at offset 9
    const first = binaryCodec.encode({
      version: 1,
      clientId: spoofedId,
      session: "s",
      sequence: 1,
      cursor: { anchors: [{ id: "x", u: 0.1, v: 0.1 }] },
    });
    evil.write(maskedFrame(0x2, first));
    await waitUntil(() => entryFor(receiver, spoofedId)?.sequence === 1, 3000, "sequence 1 ingested");

    const spoof = binaryCodec.encode({
      version: 1,
      clientId: spoofedId,
      session: "s",
      sequence: 2,
      cursor: null,
    });
    new DataView(spoof.buffer).setUint32(9, 0xffffffff, true); // above DEFAULT_MAX_SEQUENCE
    evil.write(maskedFrame(0x2, spoof));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(entryFor(receiver, spoofedId)?.sequence).toBe(1); // spoof rejected, cursor unchanged

    const next = binaryCodec.encode({
      version: 1,
      clientId: spoofedId,
      session: "s",
      sequence: 2,
      cursor: { anchors: [{ id: "y", u: 0.9, v: 0.2 }] },
    });
    evil.write(maskedFrame(0x2, next));
    await waitUntil(() => entryFor(receiver, spoofedId)?.sequence === 2, 3000, "sequence 2 ingested");
    expect(entryFor(receiver, spoofedId)?.cursor?.anchors[0]?.id).toBe("y"); // cursor still advances

    receiver.dispose();
    transport.close();
    evil.destroy();
  }, 15_000);

  it("sweeps a silent peer after staleTimeoutMs", async () => {
    const room = randomUUID();
    const transport = new SocketTransport(`ws://127.0.0.1:${referencePort}/?room=${room}`);
    const receiver = createPresenceClient({
      transport,
      codec: binaryCodec,
      publishIntervalMs: 50,
      staleTimeoutMs: 3000,
    });
    await waitUntil(() => transport.getStatus() === "connected", 3000, "receiver open");

    const silent = await rawUpgrade(referencePort, `/?room=${room}`);
    silent.write(
      maskedFrame(
        0x2,
        binaryCodec.encode({
          version: 1,
          clientId: "stale-peer",
          session: "s",
          sequence: 1,
          cursor: { anchors: [{ id: "x", u: 0.5, v: 0.5 }] },
        }),
      ),
    );

    await waitUntil(() => entryFor(receiver, "stale-peer") !== undefined, 3000, "stale-peer visible");
    await waitUntil(() => entryFor(receiver, "stale-peer") === undefined, 8000, "stale-peer swept");

    receiver.dispose();
    transport.close();
    silent.destroy();
  }, 15_000);

  it("never resolves an unregistered anchor id to a DOM element (invariant 8 end-to-end)", async () => {
    const room = randomUUID();
    const transport = new SocketTransport(`ws://127.0.0.1:${referencePort}/?room=${room}`);
    const receiver = createPresenceClient({ transport, codec: binaryCodec, publishIntervalMs: 50 });
    await waitUntil(() => transport.getStatus() === "connected", 3000, "receiver open");

    const evil = await rawUpgrade(referencePort, `/?room=${room}`);
    const unregisteredId = "never-registered-anchor";
    evil.write(
      maskedFrame(
        0x2,
        binaryCodec.encode({
          version: 1,
          clientId: "inv8",
          session: "s",
          sequence: 1,
          cursor: {
            anchors: [{ id: unregisteredId, u: 0.5, v: 0.5 }],
            viewport: { u: 0.3, v: 0.4 },
          },
        }),
      ),
    );

    const presence = await (async () => {
      await waitUntil(() => entryFor(receiver, "inv8") !== undefined, 3000, "invariant-8 message");
      return entryFor(receiver, "inv8")!;
    })();
    expect(presence.cursor?.anchors[0]?.id).toBe(unregisteredId); // validation kept the opaque id

    // receiver-side resolution with a minimal DOM stub: nothing is registered
    const registry = createAnchorRegistry();
    const documentElement = { parentElement: null } as Element;
    const readState = {
      getRect: () => undefined,
      getClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
      getStyle: () => ({ overflow: "", overflowX: "", overflowY: "" }),
      viewportSize: { width: 1000, height: 800 },
    };
    expect(registry.get(unregisteredId)).toBeNull();
    const withViewport = resolveGeometry(presence, registry, readState);
    expect(withViewport.element).toBeNull();
    expect(withViewport.tier).toBe("viewport"); // falls back to viewport, not to any element
    expect(withViewport.x).toBeCloseTo(300);
    expect(withViewport.y).toBeCloseTo(320);

    const noViewport = resolveGeometry(
      { ...presence, cursor: { anchors: presence.cursor!.anchors } },
      registry,
      readState,
    );
    expect(noViewport.element).toBeNull();
    expect(noViewport.tier).toBe("hidden");

    // positive control: a registered (stub) element resolves to itself and only itself;
    // parentElement is the documentElement sentinel so the ancestor walk stops immediately
    const stub = {
      isConnected: true,
      parentElement: documentElement,
      ownerDocument: { documentElement },
    } as unknown as Element;
    const unregister = registry.register("registered-anchor", stub);
    const registeredPresence: PresenceMessage = {
      ...presence,
      cursor: { anchors: [{ id: "registered-anchor", u: 0.25, v: 0.5 }] },
    };
    const registered = resolveGeometry(registeredPresence, registry, {
      ...readState,
      getRect: (element) => (element === stub ? { left: 0, top: 0, width: 100, height: 200 } : undefined),
      getClientRect: (element) =>
        element === stub
          ? { left: 0, top: 0, width: 100, height: 200 }
          : { left: 0, top: 0, width: 1, height: 1 },
    });
    expect(registered.tier).toBe("anchor");
    expect(registered.element).toBe(stub);
    expect(registered.x).toBeCloseTo(25);
    expect(registered.y).toBeCloseTo(100);
    unregister();

    receiver.dispose();
    transport.close();
    evil.destroy();
  }, 15_000);
});

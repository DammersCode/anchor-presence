import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeCode,
  opened,
  openUnresponsivePeer,
  type UnresponsivePeer,
} from "../_shared/relay-test-helpers";
import { slowPeerAction } from "../_shared/relay-guard";
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

    clientA.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });

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

    sender.setLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });

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
    clientA.setLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(clientA.getStatus()).toBe("connected");
  });

  it("drops an oversized frame instead of crashing the relay", async () => {
    const sender = connectClient("room-oversized");
    const receiver = connectClient("room-oversized");

    await vi.waitFor(() => expect(sender.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });
    await vi.waitFor(() => expect(receiver.getStatus()).toBe("connected"), { timeout: 5000, interval: 25 });

    sender.setLocalCursor({ anchors: [{ id: "a".repeat(2000), u: 0.1, v: 0.1 }] });
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

describe("node-ws relay with a failing auth hook", () => {
  it("refuses with 4006 when the hook throws or rejects, and keeps serving", async () => {
    for (const authCheck of [
      () => {
        throw new Error("jwt malformed");
      },
      () => Promise.reject(new Error("jwks down")),
    ]) {
      const relay = await createNodeWsRelay(0, { authCheck });
      try {
        const socket = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r&token=bad`);
        expect(await closeCode(socket)).toBe(4006);
        const again = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r&token=bad`);
        expect(await closeCode(again)).toBe(4006);
      } finally {
        await relay.close();
      }
    }
  });
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

describe("node-ws relay identity binding", () => {
  it("rewrites clientId and user of a frame to the identity the auth hook returned", async () => {
    const relay = await createNodeWsRelay(0, {
      authCheck: ({ token }) => ({ clientId: `user-${token}`, user: { name: `Name ${token}` } }),
    });
    try {
      const base = relay.url.replace(/^http/u, "ws");
      const sender = new WebSocket(`${base}/?room=bind&token=ada`);
      const peer = new WebSocket(`${base}/?room=bind&token=bob`);
      peer.binaryType = "arraybuffer";
      const received: unknown[] = [];
      peer.addEventListener("message", (event) =>
        received.push(JSON.parse(new TextDecoder().decode(event.data as ArrayBuffer))),
      );
      await Promise.all([opened(sender), opened(peer)]);

      const forged = {
        version: 1,
        clientId: "someone-else",
        session: "s",
        sequence: 1,
        cursor: null,
        leave: true,
      };
      sender.send(new TextEncoder().encode(JSON.stringify(forged)));
      sender.send(new Uint8Array([0x41, 0x02, 0xff]));

      await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 3000, interval: 25 });
      expect(received[0]).toMatchObject({ user: { name: "Name ada" } });
      expect((received[0] as { clientId: string }).clientId).toMatch(/^user-ada~/u);
      sender.close();
      peer.close();
    } finally {
      await relay.close();
    }
  });
});

describe("node-ws relay with a reset connection during async auth", () => {
  it("survives a client that resets the TCP connection while the hook runs, and 404s other paths", async () => {
    const { connect } = await import("node:net");
    const relay = await createNodeWsRelay(0, {
      authCheck: () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 150)),
    });
    try {
      const port = Number(new URL(relay.url).port);
      await new Promise<void>((resolve) => {
        const socket = connect(port, "127.0.0.1", () => {
          socket.write(
            "GET /?room=r HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
          );
          setTimeout(() => {
            socket.resetAndDestroy();
            resolve();
          }, 30);
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 300));

      const fine = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r`);
      await opened(fine);
      fine.close();
      const moved = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/room-42`);
      await expect(opened(moved)).rejects.toThrow();
    } finally {
      await relay.close();
    }
  });
});

describe("node-ws relay identity length", () => {
  it("refuses an identity with a clientId above 100 characters", async () => {
    const relay = await createNodeWsRelay(0, {
      authCheck: () => ({ clientId: "x".repeat(101), user: { name: "long" } }),
    });
    try {
      const socket = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r`);
      expect(await closeCode(socket)).toBe(4006);
    } finally {
      await relay.close();
    }
  });
});

describe("node-ws relay with refused sockets that never close", () => {
  it("does not count them against the socket cap", async () => {
    const { connect } = await import("node:net");
    const relay = await createNodeWsRelay(0, { maxSockets: 1, authCheck: ({ token }) => token !== "bad" });
    const held: import("node:net").Socket[] = [];
    try {
      const port = Number(new URL(relay.url).port);
      for (let index = 0; index < 5; index += 1) {
        await new Promise<void>((resolve) => {
          const socket = connect(port, "127.0.0.1", () => {
            socket.write(
              "GET /?room=r&token=bad HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
            );
            socket.pause();
            held.push(socket);
            setTimeout(resolve, 30);
          });
        });
      }
      const valid = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r&token=ok`);
      await opened(valid);
      // a refused socket also opens first and is closed right after, so wait before the check
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(valid.readyState).toBe(WebSocket.OPEN);
      valid.close();
    } finally {
      for (const socket of held) socket.destroy();
      await relay.close();
    }
  });
});

describe("node-ws relay slow-peer policy", () => {
  it("classifies slow-peer actions with skip hysteresis", () => {
    expect(slowPeerAction(0, false, 64, 192, 32)).toBe("send");
    expect(slowPeerAction(64, false, 64, 192, 32)).toBe("send");
    expect(slowPeerAction(65, false, 64, 192, 32)).toBe("skip");
    expect(slowPeerAction(128, true, 64, 192, 32)).toBe("skip");
    expect(slowPeerAction(192, true, 64, 192, 32)).toBe("skip");
    expect(slowPeerAction(31, true, 64, 192, 32)).toBe("send");
    expect(slowPeerAction(32, true, 64, 192, 32)).toBe("skip");
    expect(slowPeerAction(0, true, 64, 192, 32)).toBe("send");
    expect(slowPeerAction(193, false, 64, 192, 32)).toBe("close");
    expect(slowPeerAction(193, true, 64, 192, 32)).toBe("close");
    expect(slowPeerAction(4096, true, 64, 192, 32)).toBe("close");
  });
});

describe("node-ws relay shutdown", () => {
  it("closes while a client is still connected", async () => {
    const relay = await createNodeWsRelay(0);
    const client = new WebSocket(`${relay.url.replace(/^http/u, "ws")}/?room=r`);
    await opened(client);
    const started = Date.now();
    await relay.close();
    expect(Date.now() - started).toBeLessThan(2500);
    await vi.waitFor(() => expect(client.readyState).toBe(WebSocket.CLOSED), { timeout: 2000, interval: 25 });
  });
});

describe("node-ws relay entry file", () => {
  it.skipIf(process.versions.bun !== undefined)(
    "runs under Node with type stripping and relays a frame",
    async () => {
      const child = spawn(process.execPath, ["relay.ts"], {
        cwd: fileURLToPath(new URL(".", import.meta.url)),
        env: { ...process.env, PORT: "0" },
        stdio: ["ignore", "pipe", "inherit"],
        windowsHide: true,
      });
      try {
        const url = await new Promise<string>((resolve, reject) => {
          child.once("exit", (code) => reject(new Error(`relay exited with ${code}`)));
          child.stdout.on("data", (chunk: Buffer) => {
            const match = /listening on (ws:\/\/[^/\s]+)\/\?room=main/u.exec(chunk.toString());
            if (match?.[1] !== undefined) resolve(match[1]);
          });
        });
        const sender = new WebSocket(`${url}/?room=r`);
        const receiver = new WebSocket(`${url}/?room=r`);
        await Promise.all([opened(sender), opened(receiver)]);
        const received = new Promise<string>((resolve) => {
          receiver.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
        });
        sender.send(JSON.stringify({ hello: "node" }));
        expect(await received).toBe('{"hello":"node"}');
        sender.close();
        receiver.close();
      } finally {
        child.kill();
      }
    },
    15_000,
  );
});

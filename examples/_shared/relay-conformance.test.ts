import { binaryCodec } from "@anchor-presence/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { opened, spawnBunRelay } from "./relay-test-helpers";

const MAX_MESSAGE_BYTES = 1024;

type Relay = { baseUrl: string; stop: () => Promise<void> };

const relays: Record<string, () => Promise<Relay>> = {
  "bun-native": () => spawnedRelay("bun-native"),
  hono: () => spawnedRelay("hono"),
  elysia: () => spawnedRelay("elysia"),
  "node-ws": () => spawnedRelay("node-ws"),
};

async function spawnedRelay(example: string): Promise<Relay> {
  const relay = await spawnBunRelay(example, { MAX_MESSAGE_BYTES: String(MAX_MESSAGE_BYTES) });
  return { baseUrl: `ws://127.0.0.1:${relay.port}`, stop: relay.stop };
}

async function connect(
  baseUrl: string,
  room: string,
): Promise<{ socket: WebSocket; received: Uint8Array[] }> {
  const socket = new WebSocket(`${baseUrl.replace(/\/$/u, "")}/?room=${room}`);
  socket.binaryType = "arraybuffer";
  const received: Uint8Array[] = [];
  socket.addEventListener("message", (event) => received.push(new Uint8Array(event.data as ArrayBuffer)));
  await opened(socket);
  return { socket, received };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

const oversizedFrames: Array<[string, () => Uint8Array<ArrayBuffer> | string]> = [
  ["binary", () => new Uint8Array(MAX_MESSAGE_BYTES * 2)],
  ["text", () => JSON.stringify({ pad: "x".repeat(MAX_MESSAGE_BYTES * 2) })],
];

describe.each(Object.entries(relays))("relay conformance: %s", (_name, start) => {
  let relay: Relay;
  beforeAll(async () => {
    relay = await start();
  }, 20_000);
  afterAll(async () => {
    await relay.stop();
  });

  it("relays a binaryCodec message byte for byte to peers in the same room only, never back to the sender", async () => {
    const sender = await connect(relay.baseUrl, "conf-a");
    const peer = await connect(relay.baseUrl, "conf-a");
    const stranger = await connect(relay.baseUrl, "conf-b");
    const bytes = binaryCodec.encode({
      version: 1,
      clientId: "c",
      session: "s",
      sequence: 1,
      cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      user: { name: "Ada" },
    });

    sender.socket.send(new Uint8Array(bytes));
    await settle();

    expect(peer.received).toHaveLength(1);
    expect(Array.from(peer.received[0]!)).toEqual(Array.from(bytes));
    expect(stranger.received).toHaveLength(0);
    expect(sender.received).toHaveLength(0);
    for (const { socket } of [sender, peer, stranger]) socket.close();
  });

  it.each(oversizedFrames)(
    "drops a %s frame above the size cap and keeps relaying",
    async (kind, makeFrame) => {
      const sender = await connect(relay.baseUrl, `conf-big-${kind}`);
      const peer = await connect(relay.baseUrl, `conf-big-${kind}`);

      sender.socket.send(makeFrame());
      await settle();
      expect(peer.received).toHaveLength(0);

      sender.socket.send(new Uint8Array([1, 2, 3]));
      await settle();
      expect(peer.received).toHaveLength(1);
      sender.socket.close();
      peer.socket.close();
    },
  );
});

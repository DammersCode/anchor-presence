import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeCode, opened, spawnBunRelay } from "./relay-test-helpers";

const MAX_MESSAGE_BYTES = 1024;

type Relay = { baseUrl: string; stop: () => Promise<void> };

const examples = ["bun-native", "hono", "elysia", "node-ws"];

async function spawnedRelay(example: string, env: Record<string, string> = {}): Promise<Relay> {
  const relay = await spawnBunRelay(example, { MAX_MESSAGE_BYTES: String(MAX_MESSAGE_BYTES), ...env });
  return { baseUrl: `ws://127.0.0.1:${relay.port}`, stop: relay.stop };
}

async function connect(
  baseUrl: string,
  room: string,
  query = "",
): Promise<{ socket: WebSocket; received: Uint8Array[] }> {
  const socket = new WebSocket(`${baseUrl.replace(/\/$/u, "")}/?room=${room}${query}`);
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

describe.each(examples)("relay conformance: %s", (example) => {
  let relay: Relay;
  beforeAll(async () => {
    relay = await spawnedRelay(example);
  }, 20_000);
  afterAll(async () => {
    await relay.stop();
  });

  it("relays a binary frame byte for byte to peers in the same room only, never back to the sender", async () => {
    const sender = await connect(relay.baseUrl, "conf-a");
    const peer = await connect(relay.baseUrl, "conf-a");
    const stranger = await connect(relay.baseUrl, "conf-b");
    // not valid UTF-8, like a binary codec frame: a relay that decodes text would corrupt it
    const bytes = new Uint8Array([0x41, 0x02, 0xff, 0x00, 0xc3, 0x28, 0x80, 0x7f]);

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

describe.each(examples)("relay auth conformance: %s", (example) => {
  let relay: Relay;
  beforeAll(async () => {
    relay = await spawnedRelay(example, { RELAY_AUTH_TOKEN: "secret" });
  }, 20_000);
  afterAll(async () => {
    await relay.stop();
  });

  it("closes a connection without the token with code 4006 and admits one with it", async () => {
    const refused = new WebSocket(`${relay.baseUrl}/?room=auth`);
    expect(await closeCode(refused)).toBe(4006);

    const wrong = new WebSocket(`${relay.baseUrl}/?room=auth&token=nope`);
    expect(await closeCode(wrong)).toBe(4006);

    const admitted = await connect(relay.baseUrl, "auth", "&token=secret");
    expect(admitted.socket.readyState).toBe(WebSocket.OPEN);
    admitted.socket.close();
  });
});

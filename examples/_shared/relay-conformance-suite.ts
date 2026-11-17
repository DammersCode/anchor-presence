// Relay conformance suite: copy this file and relay-test-helpers.ts to test a relay of your own.
// Call defineRelayConformance(name, start) from a vitest file. `start(env)` runs your relay with these
// environment variables and returns its ws:// base URL and a stop function:
// MAX_MESSAGE_BYTES, RELAY_AUTH_TOKEN, RATE_CAPACITY, RATE_REFILL_PER_SECOND.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeCode, opened } from "./relay-test-helpers";

export const CONFORMANCE_MAX_MESSAGE_BYTES = 1024;

export type ConformanceRelay = { baseUrl: string; stop: () => Promise<void> };
export type StartRelay = (env: Record<string, string>) => Promise<ConformanceRelay>;

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
  ["binary", () => new Uint8Array(CONFORMANCE_MAX_MESSAGE_BYTES * 2)],
  ["text", () => JSON.stringify({ pad: "x".repeat(CONFORMANCE_MAX_MESSAGE_BYTES * 2) })],
];

function useRelay(start: StartRelay, env: Record<string, string>): () => ConformanceRelay {
  let relay: ConformanceRelay | undefined;
  beforeAll(async () => {
    relay = await start({ MAX_MESSAGE_BYTES: String(CONFORMANCE_MAX_MESSAGE_BYTES), ...env });
  }, 20_000);
  afterAll(async () => {
    await relay?.stop();
  });
  return () => {
    if (relay === undefined) throw new Error("relay did not start");
    return relay;
  };
}

export function defineRelayConformance(name: string, start: StartRelay): void {
  describe(`relay conformance: ${name}`, () => {
    const relay = useRelay(start, {});

    it("relays a binary frame byte for byte to peers in the same room only, never back to the sender", async () => {
      const { baseUrl } = relay();
      const sender = await connect(baseUrl, "conf-a");
      const peer = await connect(baseUrl, "conf-a");
      const stranger = await connect(baseUrl, "conf-b");
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
        const { baseUrl } = relay();
        const sender = await connect(baseUrl, `conf-big-${kind}`);
        const peer = await connect(baseUrl, `conf-big-${kind}`);

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

  describe(`relay auth conformance: ${name}`, () => {
    const relay = useRelay(start, { RELAY_AUTH_TOKEN: "secret" });

    it("closes a connection without the token with code 4006 and admits one with it", async () => {
      const { baseUrl } = relay();
      expect(await closeCode(new WebSocket(`${baseUrl}/?room=auth`))).toBe(4006);
      expect(await closeCode(new WebSocket(`${baseUrl}/?room=auth&token=nope`))).toBe(4006);

      const admitted = await connect(baseUrl, "auth", "&token=secret");
      expect(admitted.socket.readyState).toBe(WebSocket.OPEN);
      admitted.socket.close();
    });
  });

  describe(`relay rate limit conformance: ${name}`, () => {
    const relay = useRelay(start, { RATE_CAPACITY: "5", RATE_REFILL_PER_SECOND: "1" });

    it("drops frames above the per-socket rate and keeps the socket open", async () => {
      const { baseUrl } = relay();
      const sender = await connect(baseUrl, "rate");
      const peer = await connect(baseUrl, "rate");

      for (let index = 0; index < 40; index += 1) sender.socket.send(new Uint8Array([index]));
      await settle();

      expect(peer.received.length).toBeGreaterThan(0);
      expect(peer.received.length).toBeLessThan(15);
      expect(sender.socket.readyState).toBe(WebSocket.OPEN);
      sender.socket.close();
      peer.socket.close();
    });
  });
}

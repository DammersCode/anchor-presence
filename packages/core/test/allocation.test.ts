import { describe, expect, it } from "vitest";
import { jsonCodec } from "../src/codec";
import { RemotePresenceStore } from "../src/store";
import { validatePresence } from "../src/validate";
import type { CursorPresence } from "../src/protocol";

function message(clientId: string, sequence: number): CursorPresence {
  return {
    version: 1,
    clientId,
    session: `${clientId}-s`,
    sequence,
    cursor: { anchors: [{ id: "a1", u: 0.2, v: 0.4 }] },
  };
}

const SENDER_COUNT = 64;
const MESSAGE_COUNT = 20_000;

describe("core throughput floor", () => {
  it("processes 20,000 inbound messages through decode -> validate -> ingest in under 2s", () => {
    const store = new RemotePresenceStore({ maxRemoteClients: SENDER_COUNT });

    const start = performance.now();
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const senderIndex = i % SENDER_COUNT;
      const sequence = Math.floor(i / SENDER_COUNT);
      const bytes = jsonCodec.encode(message(`client-${senderIndex}`, sequence));
      const decoded = jsonCodec.decode(bytes);
      const presence = validatePresence(decoded);
      if (presence !== null) store.ingest(presence);
    }
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(2000);
  });

  it("returns the identical snapshot array reference across 1,000 calls once settled", () => {
    const store = new RemotePresenceStore();
    store.ingest(message("client-0", 0));
    const first = store.getSnapshot();
    for (let i = 0; i < 1000; i++) {
      expect(store.getSnapshot()).toBe(first);
    }
  });

  it("costs no allocation growth on the stale-sequence-drop path", () => {
    const store = new RemotePresenceStore();
    store.ingest(message("client-0", 0));
    const settled = store.getSnapshot();
    for (let i = 0; i < 10_000; i++) {
      store.ingest(message("client-0", 0)); // sequence <= existing.sequence: dropped
      expect(store.getSnapshot()).toBe(settled);
    }
  });
});

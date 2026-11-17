import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { binaryCodec } from "../src/binary-codec";
import { jsonCodec } from "../src/codec";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";
import type { CursorPresence, PeerChange, RemoteEvent } from "../src/protocol";
import { RemotePresenceStore } from "../src/store";
import { validatePresence } from "../src/validate";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const eventMessage: CursorPresence = {
  version: 1,
  clientId: "c",
  session: "s",
  sequence: 4,
  cursor: null,
  event: { type: "reaction", data: { emoji: "👍", at: [1, 2] } },
};

describe("event messages", () => {
  it.each([
    ["json", jsonCodec],
    ["binary", binaryCodec],
  ])("round-trip through the %s codec", (_name, codec) => {
    expect(codec.decode(codec.encode(eventMessage))).toEqual(eventMessage);
    const withoutData = { ...eventMessage, event: { type: "ping" } };
    expect(codec.decode(codec.encode(withoutData))).toEqual(withoutData);
  });

  it("validate keeps a well-formed event and drops a malformed one", () => {
    expect(validatePresence(eventMessage)?.event).toEqual(eventMessage.event);
    expect(validatePresence({ ...eventMessage, event: { type: "" } })?.event).toBeUndefined();
    expect(validatePresence({ ...eventMessage, event: { type: "x".repeat(65) } })?.event).toBeUndefined();
    expect(validatePresence({ ...eventMessage, event: "ping" })?.event).toBeUndefined();
    expect(
      validatePresence({ ...eventMessage, event: { type: "big", data: "x".repeat(9000) } })?.event,
    ).toBeUndefined();
  });

  it("validate drops an invalid event instead of passing it on as a plain presence", () => {
    const dropped = validatePresence({ ...eventMessage, event: { type: "big", data: "x".repeat(9000) } });
    expect(dropped).toBeNull();
  });

  it("validate ignores an event on a message that carries a cursor", () => {
    const message = { ...eventMessage, cursor: { anchors: [] } };
    expect(validatePresence(message)?.event).toBeUndefined();
  });
});

describe("client events", () => {
  function pair() {
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a, clientId: "A", codec: binaryCodec });
    const receiver = createPresenceClient({ transport: b, clientId: "B", codec: binaryCodec });
    void a.connect?.();
    void b.connect?.();
    return { sender, receiver };
  }

  it("delivers an event to remote subscribers only and never stores it", () => {
    const { sender, receiver } = pair();
    const received: RemoteEvent[] = [];
    const own: RemoteEvent[] = [];
    receiver.subscribeEvents((event) => received.push(event));
    sender.subscribeEvents((event) => own.push(event));

    expect(sender.sendEvent("reaction", { emoji: "🎉" })).toBe(true);

    expect(received).toEqual([{ clientId: "A", type: "reaction", data: { emoji: "🎉" } }]);
    expect(own).toEqual([]);
    expect(receiver.getRemotePresence()).toHaveLength(0);
    sender.dispose();
    receiver.dispose();
  });

  it("drops events from a sender above the burst limit", () => {
    const { sender, receiver } = pair();
    const received: RemoteEvent[] = [];
    receiver.subscribeEvents((event) => received.push(event));

    for (let index = 0; index < 100; index += 1) sender.sendEvent("spam", index);

    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThan(40);
    sender.dispose();
    receiver.dispose();
  });

  it("returns false for an event above the field limits and leaves the cursor alone", () => {
    const { sender, receiver } = pair();
    sender.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(100);

    expect(sender.sendEvent("big", "x".repeat(9000))).toBe(false);
    vi.advanceTimersByTime(100);

    expect(receiver.getRemoteSnapshot()[0]?.cursor).not.toBeNull();
    sender.dispose();
    receiver.dispose();
  });

  it("returns false for an invalid type or a disposed client and stops after unsubscribe", () => {
    const { sender, receiver } = pair();
    const received: RemoteEvent[] = [];
    const stop = receiver.subscribeEvents((event) => received.push(event));

    expect(sender.sendEvent("")).toBe(false);
    expect(sender.sendEvent("x".repeat(65))).toBe(false);
    stop();
    sender.sendEvent("ping");
    expect(received).toEqual([]);
    sender.dispose();
    expect(sender.sendEvent("ping")).toBe(false);
    receiver.dispose();
  });
});

describe("peer changes", () => {
  it("reports join, leave message and stale removal", () => {
    let now = 0;
    const store = new RemotePresenceStore({ now: () => now, staleTimeoutMs: 1000 });
    const changes: PeerChange[] = [];
    store.subscribePeers((change) => changes.push(change));
    const message = (
      clientId: string,
      sequence: number,
      extra: Partial<CursorPresence> = {},
    ): CursorPresence => ({
      version: 1,
      clientId,
      session: "s",
      sequence,
      cursor: null,
      ...extra,
    });

    store.ingest(message("a", 0));
    store.ingest(message("a", 1));
    store.ingest(message("b", 0));
    store.ingest({ ...message("b", 0, { user: { name: "New" } }), session: "s2" });
    store.ingest(message("a", 2, { user: { name: "Ada" } }));
    store.ingest(message("a", 3, { user: { name: "Ada" } }));
    store.ingest(message("a", 4, { leave: true }));
    now = 2000;
    store.sweep();

    expect(changes).toEqual([
      { type: "join", clientId: "a" },
      { type: "join", clientId: "b" },
      { type: "update", clientId: "b" },
      { type: "update", clientId: "a" },
      { type: "leave", clientId: "a" },
      { type: "leave", clientId: "b" },
    ]);
  });
});

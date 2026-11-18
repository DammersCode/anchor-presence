import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { binaryCodec } from "../src/binary-codec";
import { createPresenceClient } from "../src/client";
import { createEventChannel, createEventParser } from "../src/event-channel";
import type { TypedRemoteEvent } from "../src/event-channel";
import { createInMemoryPair } from "../src/in-memory-transport";

type Events = { reaction: { emoji: string }; ping: undefined };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function pair(
  options: { eventRateLimit?: { burst?: number; perSecond?: number; totalPerSecond?: number } } = {},
) {
  const { a, b } = createInMemoryPair();
  const sender = createPresenceClient({ transport: a, clientId: "A", codec: binaryCodec });
  const receiver = createPresenceClient({ transport: b, clientId: "B", codec: binaryCodec, ...options });
  void a.connect?.();
  void b.connect?.();
  return { sender, receiver };
}

describe("createEventChannel", () => {
  it("sends typed events and delivers them typed", () => {
    const { sender, receiver } = pair();
    const out = createEventChannel<Events>(sender);
    const into = createEventChannel<Events>(receiver);
    const seen: TypedRemoteEvent<Events>[] = [];
    into.subscribe((event) => seen.push(event));

    expect(out.send("reaction", { emoji: "🎉" })).toBe(true);
    expect(out.send("ping")).toBe(true);
    // never called: the compiler alone must reject these
    const rejected = () => {
      // @ts-expect-error a misspelled event type must not compile
      out.send("reactions", { emoji: "x" });
      // @ts-expect-error data of the wrong type must not compile
      out.send("reaction", { emoji: 3 });
      // @ts-expect-error an event with required data needs it
      out.send("reaction");
    };
    expect(rejected).toBeTypeOf("function");

    expect(seen.map((event) => event.type)).toEqual(["reaction", "ping"]);
    const first = seen[0];
    if (first?.type === "reaction") expectTypeOf(first.data).toEqualTypeOf<{ emoji: string }>();
    expect(first).toEqual({ clientId: "A", type: "reaction", data: { emoji: "🎉" } });
    sender.dispose();
    receiver.dispose();
  });
});

describe("event rate limit options", () => {
  it("limits per sender and in total, and reads the injected clock", () => {
    let now = 0;
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a, clientId: "A", codec: binaryCodec });
    const receiver = createPresenceClient({
      transport: b,
      clientId: "B",
      codec: binaryCodec,
      now: () => now,
      eventRateLimit: { burst: 3, perSecond: 1, totalPerSecond: 100 },
    });
    void a.connect?.();
    void b.connect?.();
    let received = 0;
    receiver.subscribeEvents(() => (received += 1));

    for (let index = 0; index < 10; index += 1) sender.sendEvent("spam");
    expect(received).toBe(3);

    now += 2000;
    for (let index = 0; index < 10; index += 1) sender.sendEvent("spam");
    expect(received).toBe(5);
    sender.dispose();
    receiver.dispose();
  });

  it("caps all senders together, so a rotating clientId does not get around the limit", () => {
    const { a, b } = createInMemoryPair();
    const receiver = createPresenceClient({
      transport: b,
      clientId: "B",
      codec: binaryCodec,
      now: () => 0,
      eventRateLimit: { burst: 100, perSecond: 100, totalPerSecond: 5 },
    });
    void a.connect?.();
    void b.connect?.();
    let received = 0;
    receiver.subscribeEvents(() => (received += 1));

    for (let index = 0; index < 20; index += 1) {
      const rotating = createPresenceClient({
        transport: a,
        clientId: "sender-" + index,
        codec: binaryCodec,
      });
      rotating.sendEvent("spam");
      rotating.dispose();
    }

    expect(received).toBe(5);
    receiver.dispose();
  });
});

describe("subscribeUser", () => {
  it("calls the listener when setUser changes the value, not when it repeats", () => {
    const { sender } = pair();
    const calls: unknown[] = [];
    const stop = sender.subscribeUser(() => calls.push(sender.getUser()));

    sender.setUser({ name: "Ada" });
    const same = sender.getUser();
    sender.setUser(same);
    sender.setUser({ name: "Bo" });
    stop();
    sender.setUser({ name: "Cy" });

    expect(calls).toEqual([{ name: "Ada" }, { name: "Bo" }]);
    sender.dispose();
  });
});

describe("createEventParser", () => {
  const parse = createEventParser<Events>({
    reaction: (data) =>
      typeof (data as { emoji?: unknown } | undefined)?.emoji === "string"
        ? (data as { emoji: string })
        : undefined,
    ping: () => undefined,
  });

  it("passes checked events and drops unknown types and bad data", () => {
    expect(parse({ clientId: "A", type: "reaction", data: { emoji: "🎉" } })).toEqual({
      clientId: "A",
      type: "reaction",
      data: { emoji: "🎉" },
    });
    expect(parse({ clientId: "A", type: "ping" })).toEqual({ clientId: "A", type: "ping", data: undefined });
    expect(parse({ clientId: "A", type: "reaction", data: { emoji: 3 } })).toBeUndefined();
    expect(parse({ clientId: "A", type: "toString" })).toBeUndefined();
    expect(parse({ clientId: "A", type: "other" })).toBeUndefined();
  });
});

describe("event maps", () => {
  it("accepts an interface, which has no index signature", () => {
    interface InterfaceEvents {
      ping: undefined;
      note: { text: string };
    }
    expectTypeOf<TypedRemoteEvent<InterfaceEvents>["type"]>().toEqualTypeOf<"ping" | "note">();
  });
});

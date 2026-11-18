import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";
import { defaultNow } from "../src/internal/clock";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function connectedPair(receiverOptions: Record<string, unknown> = {}) {
  const { a, b } = createInMemoryPair();
  const sender = createPresenceClient<unknown, unknown>({ transport: a, clientId: "S" });
  const receiver = createPresenceClient<unknown, unknown>({
    transport: b,
    clientId: "R",
    ...receiverOptions,
  });
  void a.connect?.();
  void b.connect?.();
  return { sender, receiver };
}

describe("a field that cannot encode", () => {
  it("keeps a good user when the context fails", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sender, receiver } = connectedPair();
    sender.setUser({ name: "Ada" });
    sender.setContext({ big: 10n });
    sender.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(200);
    const peer = receiver.getRemoteSnapshot()[0];
    expect(peer?.user).toEqual({ name: "Ada" });
    expect(peer?.context).toBeUndefined();
  });

  it("keeps a good context when the user fails", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sender, receiver } = connectedPair();
    sender.setUser({ big: 10n });
    sender.setContext({ page: "home" });
    sender.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(200);
    const peer = receiver.getRemoteSnapshot()[0];
    expect(peer?.context).toEqual({ page: "home" });
    expect(peer?.user).toBeUndefined();
  });
});

describe("the clock", () => {
  it("reads performance.now by default", () => {
    vi.spyOn(performance, "now").mockReturnValue(123);
    expect(defaultNow()).toBe(123);
  });

  it("keeps delivering events after the clock steps back", () => {
    let now = 10_000;
    const { sender, receiver } = connectedPair({
      now: () => now,
      eventRateLimit: { burst: 5, perSecond: 1, totalPerSecond: 100 },
    });
    let received = 0;
    receiver.subscribeEvents(() => (received += 1));
    sender.sendEvent("ping");
    now = 5_000;
    sender.sendEvent("ping");
    expect(received).toBe(2);
  });
});

describe("the default shape check", () => {
  it("drops a key that exists on Object.prototype and warns about a dropped key", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient<unknown, Record<string, unknown>>({
      transport: a,
      clientId: "S",
    });
    sender.setUser({ name: "Ada", toString: "boom", nested: { x: 1 } });
    const receiver = createPresenceClient<unknown, Record<string, unknown>>({
      transport: b,
      clientId: "R",
    });
    receiver.setUser({ name: "" });
    void a.connect?.();
    void b.connect?.();
    sender.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(200);
    const peer = receiver.getRemoteSnapshot()[0];
    expect(peer?.user).toEqual({ name: "Ada" });
    expect(warn.mock.calls.some(([text]) => String(text).includes("dropped a key"))).toBe(true);
  });
});

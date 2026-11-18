import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";
import { binaryCodec } from "../src/binary-codec";

it("binary: refuses a viewport coordinate above the float32 range", () => {
  const message = {
    version: 1 as const,
    clientId: "c",
    session: "s",
    sequence: 1,
    cursor: { anchors: [], viewport: { u: 1e39, v: 0.5 } },
  };
  expect(() => binaryCodec.encode(message)).toThrow("invalid viewport");
  expect(() => binaryCodec.encode(message)).toThrow(TypeError);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const cursor = { anchors: [{ id: "a", u: 0.5, v: 0.5 }] };

describe("development warnings", () => {
  it("warns when another session uses the same clientId", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { a, b } = createInMemoryPair();
    const other = createPresenceClient({ transport: a, clientId: "self" });
    const local = createPresenceClient({ transport: b, clientId: "self" });
    other.setLocalCursor(cursor);
    vi.advanceTimersByTime(1000);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/another client uses the clientId "self"/u);
    other.dispose();
    local.dispose();
  });

  it("warns when staleTimeoutMs is exactly twice heartbeatIntervalMs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a, heartbeatIntervalMs: 5000, staleTimeoutMs: 10_000 });
    expect(warn.mock.calls.flat().join(" ")).toMatch(/staleTimeoutMs \(10000\) is at most twice/u);
    client.dispose();
  });
});

describe("dev warnings", () => {
  it("names a transport send failure in the warning and retries on a bounded backoff", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(() => {
      throw new Error("boom");
    });
    const client = createPresenceClient({
      transport: { send, subscribe: () => () => {} },
      publishIntervalMs: 16,
    });
    client.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    vi.advanceTimersByTime(1000);
    expect(warn.mock.calls.flat().join(" ")).toMatch(/transport send failure can also cause this/u);
    expect(send.mock.calls.length).toBeLessThan(10);
    client.dispose();
  });
});

describe("reconnect", () => {
  it("removes a silent peer within 2 * heartbeatIntervalMs + 5 s after a reconnect", () => {
    vi.useFakeTimers();
    const now = () => Date.now();
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a, clientId: "S", heartbeatIntervalMs: 600_000, now });
    const receiver = createPresenceClient({
      transport: b,
      clientId: "R",
      heartbeatIntervalMs: 1000,
      staleTimeoutMs: 60_000,
      // a short idle time makes the sweep run every 2 s
      idleAfterMs: 4000,
      now,
    });
    sender.setLocalCursor(cursor);
    // the sender must know the receiver, or the reconnect publish draws a refreshing reply
    vi.advanceTimersByTime(1500);
    expect(receiver.getRemoteSnapshot().map((p) => p.clientId)).toEqual(["S"]);
    void b.disconnect?.();
    void b.connect?.();
    vi.advanceTimersByTime(12_000);
    expect(receiver.getRemoteSnapshot()).toEqual([]);
    sender.dispose();
    receiver.dispose();
  });
});

describe("dispose", () => {
  it("runs every teardown after one throws", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const after = vi.fn();
    client.registerTeardown(() => {
      throw new Error("boom");
    });
    client.registerTeardown(after);
    expect(() => client.dispose()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });
});

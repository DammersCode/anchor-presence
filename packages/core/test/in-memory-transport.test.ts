import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { binaryCodec } from "../src/binary-codec";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createInMemoryPair", () => {
  it("dispose() disconnects both sides and notifies their status listeners", () => {
    const pair = createInMemoryPair();
    void pair.a.connect();
    void pair.b.connect();
    const seen: string[] = [];
    pair.a.subscribeStatus((status) => seen.push(status));
    pair.dispose();
    expect(seen).toEqual(["connected", "disconnected"]);
    expect(pair.a.getStatus()).toBe("disconnected");
    expect(pair.b.getStatus()).toBe("disconnected");
  });

  it("connect() after dispose() keeps both sides disconnected", () => {
    const pair = createInMemoryPair();
    pair.dispose();
    void pair.a.connect();
    void pair.b.connect();
    expect(pair.a.getStatus()).toBe("disconnected");
    expect(pair.b.getStatus()).toBe("disconnected");
  });

  it("delivers client A's cursor to client B end to end (decode+validate runs on the other side)", () => {
    const { a, b } = createInMemoryPair();
    const clientA = createPresenceClient({ transport: a, clientId: "A" });
    const clientB = createPresenceClient({ transport: b, clientId: "B" });

    void a.connect?.();
    void b.connect?.();

    clientA.setLocalCursor({ anchors: [{ id: "x", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);

    const fromA = clientB.getRemoteSnapshot().find((p) => p.clientId === "A");
    expect(fromA).toBeDefined();
    expect(fromA?.cursor).not.toBeNull();
    expect(fromA?.cursor?.anchors[0]?.id).toBe("x");

    clientA.dispose();
    clientB.dispose();
  });

  it("delivers binaryCodec cursor, user, and context changes end to end", () => {
    const { a, b } = createInMemoryPair();
    const clientA = createPresenceClient({
      transport: a,
      clientId: "A",
      codec: binaryCodec,
      user: { name: "A" },
    });
    const clientB = createPresenceClient({
      transport: b,
      clientId: "B",
      codec: binaryCodec,
    });

    void a.connect?.();
    void b.connect?.();

    clientA.setLocalCursor({ anchors: [{ id: "x", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);

    const initial = clientB.getRemoteSnapshot().find((p) => p.clientId === "A");
    expect(initial?.cursor?.anchors[0]?.id).toBe("x");
    expect(initial?.cursor?.anchors[0]?.u).toBe(0.5);
    expect(initial?.user).toEqual({ name: "A" });
    expect("context" in initial!).toBe(false);

    clientA.setContext({ page: "dashboard" });
    vi.advanceTimersByTime(50);
    const withContext = clientB.getRemoteSnapshot().find((p) => p.clientId === "A");
    expect(withContext?.context).toEqual({ page: "dashboard" });

    clientA.setContext(undefined);
    vi.advanceTimersByTime(50);
    const cleared = clientB.getRemoteSnapshot().find((p) => p.clientId === "A");
    expect("context" in cleared!).toBe(false);

    clientA.dispose();
    clientB.dispose();
  });

  it("subscribeStatus replays the current status and getStatus tracks the lifecycle", () => {
    const { a } = createInMemoryPair();
    // autoConnect: false keeps the client from connecting the side under test
    const client = createPresenceClient({ transport: a, clientId: "A", autoConnect: false });
    const seen: string[] = [];
    const unsub = a.subscribeStatus((s) => seen.push(s));

    expect(a.getStatus()).toBe("disconnected");
    expect(client.getStatus()).toBe("disconnected");
    expect(seen).toEqual(["disconnected"]); // replay on subscribe

    void a.connect?.();
    expect(a.getStatus()).toBe("connected");
    expect(client.getStatus()).toBe("connected");

    void a.disconnect?.();
    expect(a.getStatus()).toBe("disconnected");
    expect(client.getStatus()).toBe("disconnected");

    expect(seen).toEqual(["disconnected", "connected", "disconnected"]);

    unsub();
    client.dispose();
  });

  it("dispose stops delivery; a later send is dropped silently", () => {
    const pair = createInMemoryPair();
    const { a, b } = pair;
    const received: Uint8Array[] = [];
    const unsub = b.subscribe((data) => received.push(data));

    pair.dispose();
    expect(() => {
      void a.send(new Uint8Array([1, 2, 3]));
    }).not.toThrow();
    expect(received).toHaveLength(0);

    unsub();
  });

  it("async: true routes delivery through a microtask so callers can interleave", async () => {
    const { a, b } = createInMemoryPair({ async: true });
    const received: Uint8Array[] = [];
    const unsub = b.subscribe((data) => received.push(data));

    void a.send(new Uint8Array([9, 9]));
    expect(received).toHaveLength(0); // not delivered synchronously

    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0]?.[0]).toBe(9);

    unsub();
  });

  it("is DOM-free: runs under node without any document global", () => {
    expect(typeof document).toBe("undefined");
    const { a, b } = createInMemoryPair();
    const received: Uint8Array[] = [];
    const unsub = b.subscribe((data) => received.push(data));

    void a.send(new Uint8Array([1]));
    expect(received).toHaveLength(1);

    unsub();
  });

  it("a throwing listener does not stop the others or throw into the sender", () => {
    const pair = createInMemoryPair();
    void pair.a.connect();
    void pair.b.connect();
    const received: number[] = [];
    pair.b.subscribe(() => {
      throw new Error("boom");
    });
    pair.b.subscribe((data) => received.push(data[0]!));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => pair.a.send(Uint8Array.of(4))).not.toThrow();
    expect(received).toEqual([4]);
    spy.mockRestore();
  });

  it("dispose clears both sides after a status listener throws", () => {
    const pair = createInMemoryPair();
    void pair.a.connect();
    void pair.b.connect();
    let armed = false;
    pair.a.subscribeStatus(() => {
      if (armed) throw new Error("boom");
    });
    const seen: string[] = [];
    pair.b.subscribeStatus((status) => seen.push(status));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    armed = true;
    expect(() => pair.dispose()).not.toThrow();
    expect(seen).toEqual(["connected", "disconnected"]);
    spy.mockRestore();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "@anchor-presence/core";
import { createWebSocketTransport } from "../src/transport";
import type { WebSocketCtor, WebSocketLike } from "../src/transport";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  static fire(
    instance: FakeWebSocket,
    kind: "open" | "close" | "error" | "message",
    payload?: unknown,
  ): void {
    if (kind === "open") {
      instance.readyState = FakeWebSocket.OPEN;
      instance.onopen?.();
    } else if (kind === "close") {
      instance.readyState = FakeWebSocket.CLOSED;
      instance.onclose?.((payload as { code?: number } | undefined) ?? {});
    } else if (kind === "error") {
      instance.onerror?.();
    } else {
      instance.onmessage?.({ data: payload });
    }
  }

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: null | (() => void) = null;
  onclose: null | ((event: { code?: number }) => void) = null;
  onerror: null | (() => void) = null;
  onmessage: null | ((event: { data: unknown }) => void) = null;
  binaryType = "";
  bufferedAmount = 0;
  sent: Uint8Array[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBufferView<ArrayBuffer>): void {
    this.sent.push(data as Uint8Array);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

const TEST_URL = "ws://relay.test/?room=main";

type MakeOverrides = {
  token?: string | (() => string | Promise<string>);
  reconnect?: boolean;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  random?: () => number;
  stableAfterMs?: number;
  shouldReconnect?: (close: { code?: number }) => boolean;
};

function make(overrides: MakeOverrides = {}) {
  return createWebSocketTransport({ url: TEST_URL, WebSocketCtor: FakeWebSocket, ...overrides });
}

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances.at(-1)!;
}

describe("createWebSocketTransport", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts connecting, connects on open, ends disconnected after close with reconnect off", () => {
    vi.useFakeTimers();
    const transport = make({ reconnect: false });
    expect(transport.getStatus?.()).toBe("connecting");

    void transport.connect();
    expect(transport.getStatus?.()).toBe("connecting");
    expect(lastSocket().binaryType).toBe("arraybuffer");

    FakeWebSocket.fire(lastSocket(), "open");
    expect(transport.getStatus?.()).toBe("connected");

    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.getStatus?.()).toBe("disconnected");
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("reconnects with exponential backoff: base delay, doubling, capped at maxBackoffMs", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 200, maxBackoffMs: 1000, random: () => 1 });
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");
    expect(transport.getStatus?.()).toBe("connected");

    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.getStatus?.()).toBe("reconnecting");
    vi.advanceTimersByTime(199);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.getStatus?.()).toBe("reconnecting");
    vi.advanceTimersByTime(399);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.fire(lastSocket(), "close");
    vi.advanceTimersByTime(799);
    expect(FakeWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(4);

    FakeWebSocket.fire(lastSocket(), "close");
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(4);
    vi.advanceTimersByTime(201);
    expect(FakeWebSocket.instances).toHaveLength(5);
    expect(transport.getStatus?.()).toBe("reconnecting");
  });

  it("jitters the first reconnect delay down to half the base backoff", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 200, random: () => 0 });
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");

    FakeWebSocket.fire(lastSocket(), "close");
    vi.advanceTimersByTime(99);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("disconnect() cancels the pending reconnect timer", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 200 });
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");
    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.getStatus?.()).toBe("reconnecting");

    void transport.disconnect?.();
    expect(transport.getStatus?.()).toBe("disconnected");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  // a constructor that throws on the given attempt and delegates to FakeWebSocket otherwise
  function flakyCtor(throwOnAttempt: number): { ctor: WebSocketCtor; attempts: () => number } {
    let attempts = 0;
    const ctor = function (url: string) {
      attempts += 1;
      if (attempts === throwOnAttempt) throw new Error("socket constructor failed");
      return new FakeWebSocket(url);
    } as unknown as WebSocketCtor;
    return { ctor, attempts: () => attempts };
  }

  it("reconnects with backoff when the socket constructor throws from a scheduled attempt", () => {
    vi.useFakeTimers();
    const { ctor: FlakyWebSocket, attempts } = flakyCtor(2);
    const transport = createWebSocketTransport({
      url: TEST_URL,
      WebSocketCtor: FlakyWebSocket,
      baseBackoffMs: 200,
      random: () => 1,
    });

    void transport.connect?.();
    FakeWebSocket.fire(FakeWebSocket.instances.at(-1)!, "open");
    expect(transport.getStatus?.()).toBe("connected");

    FakeWebSocket.fire(FakeWebSocket.instances.at(-1)!, "close");
    expect(transport.getStatus?.()).toBe("reconnecting");

    vi.advanceTimersByTime(200); // second attempt: the constructor throws
    expect(attempts()).toBe(2);
    expect(transport.getStatus?.()).toBe("reconnecting");
    expect(vi.getTimerCount()).toBe(1); // next attempt scheduled instead of an uncaught throw

    vi.advanceTimersByTime(400); // third attempt: constructor succeeds
    expect(attempts()).toBe(3);
    FakeWebSocket.fire(FakeWebSocket.instances.at(-1)!, "open");
    expect(transport.getStatus?.()).toBe("connected");
  });

  it("does not throw from connect() when the socket constructor fails on the first attempt", () => {
    vi.useFakeTimers();
    const { ctor: FlakyWebSocket, attempts } = flakyCtor(1);
    const transport = createWebSocketTransport({
      url: TEST_URL,
      WebSocketCtor: FlakyWebSocket,
      baseBackoffMs: 200,
      random: () => 1,
    });

    expect(() => transport.connect?.()).not.toThrow();
    expect(attempts()).toBe(1);
    expect(transport.getStatus?.()).toBe("reconnecting"); // not stuck in "connecting"
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(200);
    expect(attempts()).toBe(2);
    FakeWebSocket.fire(FakeWebSocket.instances.at(-1)!, "open");
    expect(transport.getStatus?.()).toBe("connected");
  });

  it("goes disconnected without throwing when the constructor fails and reconnect is off", () => {
    const { ctor: FailingWebSocket } = flakyCtor(1); // the only attempt throws
    const transport = createWebSocketTransport({
      url: TEST_URL,
      reconnect: false,
      WebSocketCtor: FailingWebSocket,
    });

    expect(() => transport.connect?.()).not.toThrow();
    expect(transport.getStatus?.()).toBe("disconnected");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("replays the current status to a late subscriber synchronously", () => {
    const transport = make();
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");

    const statuses: ConnectionStatus[] = [];
    const unsubscribe = transport.subscribeStatus?.((s) => statuses.push(s));
    expect(statuses).toEqual(["connected"]);

    FakeWebSocket.fire(lastSocket(), "close");
    expect(statuses).toEqual(["connected", "reconnecting"]);
    unsubscribe?.();

    const afterUnsubscribe: ConnectionStatus[] = [];
    transport.subscribeStatus?.((s) => afterUnsubscribe.push(s));
    expect(afterUnsubscribe).toEqual(["reconnecting"]);
  });

  it("drops send before open and records exact bytes while OPEN", () => {
    const transport = make();
    const bytes = new Uint8Array([1, 2, 3]);

    expect(() => transport.send(bytes)).not.toThrow();
    expect(FakeWebSocket.instances).toHaveLength(0);

    void transport.connect?.();
    expect(() => transport.send(bytes)).not.toThrow();
    expect(lastSocket().sent).toHaveLength(0);

    FakeWebSocket.fire(lastSocket(), "open");
    void transport.send(bytes);
    expect(lastSocket().sent).toHaveLength(1);
    expect(lastSocket().sent[0]).toEqual(bytes);
  });

  it("getStatus matches subscribeStatus across the full status cycle", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 100 });
    const events: ConnectionStatus[] = [];
    transport.subscribeStatus?.((s) => events.push(s));

    expect(events).toEqual(["connecting"]);
    expect(transport.getStatus?.()).toBe("connecting");

    void transport.connect?.();
    expect(transport.getStatus?.()).toBe("connecting");

    FakeWebSocket.fire(lastSocket(), "open");
    expect(transport.getStatus?.()).toBe("connected");

    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.getStatus?.()).toBe("reconnecting");

    vi.advanceTimersByTime(100);
    FakeWebSocket.fire(lastSocket(), "open");
    expect(transport.getStatus?.()).toBe("connected");

    expect(events).toEqual(["connecting", "connected", "reconnecting", "connected"]);
  });

  it("treats connect() after disconnect() as a no-op and warns in dev", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = make();
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");
    void transport.disconnect?.();
    expect(transport.getStatus?.()).toBe("disconnected");

    void transport.connect?.();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(transport.getStatus?.()).toBe("disconnected");

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not open a second socket while one is connecting", () => {
    const transport = make({ reconnect: false });
    void transport.connect();
    const first = lastSocket();
    void transport.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(first.readyState).toBe(FakeWebSocket.CONNECTING);

    FakeWebSocket.fire(first, "open");
    expect(transport.getStatus?.()).toBe("connected");
  });

  it("does not open a second socket while one is already open", () => {
    const transport = make({ reconnect: false });
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "open");
    void transport.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(transport.getStatus?.()).toBe("connected");
  });

  it("delivers ArrayBuffer messages to data subscribers and ignores other payloads", () => {
    const transport = make();
    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");

    const received: Uint8Array[] = [];
    transport.subscribe((data) => received.push(data));

    FakeWebSocket.fire(lastSocket(), "message", new Uint8Array([9, 8, 7]).buffer);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(new Uint8Array([9, 8, 7]));

    FakeWebSocket.fire(lastSocket(), "message", "not-a-buffer");
    expect(received).toHaveLength(1);
  });

  it("funnels error events into close()", () => {
    const transport = make({ reconnect: false });
    void transport.connect?.();
    const ws = lastSocket();
    const closeSpy = vi.spyOn(ws, "close");

    FakeWebSocket.fire(ws, "error");
    expect(closeSpy).toHaveBeenCalledTimes(1);

    FakeWebSocket.fire(ws, "close");
    expect(transport.getStatus?.()).toBe("disconnected");
  });

  it("reports the live socket's bufferedAmount and zero while no socket is open", () => {
    const transport = make();
    expect(transport.bufferedBytes?.()).toBe(0);

    void transport.connect?.();
    FakeWebSocket.fire(lastSocket(), "open");
    expect(transport.bufferedBytes?.()).toBe(0);

    lastSocket().bufferedAmount = 42;
    expect(transport.bufferedBytes?.()).toBe(42);

    FakeWebSocket.fire(lastSocket(), "close");
    expect(transport.bufferedBytes?.()).toBe(0);
  });

  it("builds the default URL from host, port, and path", () => {
    const transport = createWebSocketTransport({
      host: "relay.test",
      port: 9000,
      path: "/?room=main",
      WebSocketCtor: FakeWebSocket,
    });
    void transport.connect?.();

    expect(lastSocket().url).toBe("ws://relay.test:9000/?room=main");
  });

  it("uses / as the default path when no query is supplied", () => {
    const transport = createWebSocketTransport({
      host: "relay.test",
      port: 9000,
      WebSocketCtor: FakeWebSocket,
    });
    void transport.connect?.();

    expect(lastSocket().url).toBe("ws://relay.test:9000/");
  });

  it("appends an opt-in token to the upgrade URL, URL-encoded", () => {
    const transport = createWebSocketTransport({
      url: TEST_URL,
      token: "a b+c=d",
      WebSocketCtor: FakeWebSocket,
    });
    void transport.connect?.();

    expect(lastSocket().url).toBe("ws://relay.test/?room=main&token=a%20b%2Bc%3Dd");
  });

  it("appends the token with ? when the URL has no query", () => {
    const transport = createWebSocketTransport({
      url: "ws://relay.test/",
      token: "t",
      WebSocketCtor: FakeWebSocket,
    });
    void transport.connect?.();

    expect(lastSocket().url).toBe("ws://relay.test/?token=t");
  });

  it("keeps growing the backoff when a relay accepts and then rejects every connection", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 100, maxBackoffMs: 10_000, random: () => 1 });
    void transport.connect();
    const gaps: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      FakeWebSocket.fire(lastSocket(), "open");
      FakeWebSocket.fire(lastSocket(), "close");
      const before = FakeWebSocket.instances.length;
      let waited = 0;
      while (FakeWebSocket.instances.length === before) {
        vi.advanceTimersByTime(10);
        waited += 10;
      }
      gaps.push(waited);
    }
    expect(gaps).toEqual([100, 200, 400, 800]);
  });

  it("resets the backoff after a connection stays open for stableAfterMs", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 100, random: () => 1, stableAfterMs: 1000 });
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "open");
    FakeWebSocket.fire(lastSocket(), "close");
    vi.advanceTimersByTime(100);
    FakeWebSocket.fire(lastSocket(), "open");
    vi.advanceTimersByTime(1000);
    FakeWebSocket.fire(lastSocket(), "close");
    const before = FakeWebSocket.instances.length;
    vi.advanceTimersByTime(100);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it("does not reconnect after a policy-violation close (1008) and ends disconnected", () => {
    vi.useFakeTimers();
    const transport = make();
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "open");
    FakeWebSocket.fire(lastSocket(), "close", { code: 1008 });
    expect(transport.getStatus?.()).toBe("disconnected");
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("lets shouldReconnect veto a reconnect for custom close codes", () => {
    vi.useFakeTimers();
    const transport = make({ shouldReconnect: (close) => close.code !== 4401 });
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "close", { code: 4401 });
    expect(transport.getStatus?.()).toBe("disconnected");
  });

  it("asks for an explicit url when window is not available", () => {
    vi.stubGlobal("window", undefined);
    try {
      expect(() => createWebSocketTransport({ WebSocketCtor: FakeWebSocket })).toThrow(/pass .url./u);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("asks a token function for a fresh token on every connection attempt", () => {
    vi.useFakeTimers();
    let count = 0;
    const transport = make({ token: () => `t${++count}`, baseBackoffMs: 100, random: () => 1 });
    void transport.connect();
    expect(lastSocket().url).toBe(`${TEST_URL}&token=t1`);
    FakeWebSocket.fire(lastSocket(), "open");
    FakeWebSocket.fire(lastSocket(), "close");
    vi.advanceTimersByTime(100);
    expect(lastSocket().url).toBe(`${TEST_URL}&token=t2`);
  });

  it("waits for an async token and reconnects when the token call rejects", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const transport = make({
      token: () => (++calls === 1 ? Promise.reject(new Error("expired")) : Promise.resolve("ok")),
      baseBackoffMs: 100,
      random: () => 1,
    });
    void transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(transport.getStatus?.()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(100);
    expect(lastSocket().url).toBe(`${TEST_URL}&token=ok`);
  });

  it("does not reconnect after an auth (4006) or origin (4004) close", () => {
    vi.useFakeTimers();
    const transport = make();
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "close", { code: 4006 });
    expect(transport.getStatus?.()).toBe("disconnected");
  });

  it("reports the close code, reason and whether it reconnects", () => {
    vi.useFakeTimers();
    const transport = make();
    const closes: unknown[] = [];
    transport.subscribeClose?.((close) => closes.push(close));
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "close", { code: 1006 });
    vi.advanceTimersByTime(60_000);
    FakeWebSocket.fire(lastSocket(), "close", { code: 4006, reason: "invalid token" });

    expect(closes).toEqual([
      { code: 1006, willReconnect: true },
      { code: 4006, reason: "invalid token", willReconnect: false },
    ]);
  });

  it("reports a failed token function as a close with a reason", async () => {
    vi.useFakeTimers();
    const transport = make({ token: () => Promise.reject(new Error("expired")), baseBackoffMs: 100 });
    const closes: unknown[] = [];
    transport.subscribeClose?.((close) => closes.push(close));
    void transport.connect();
    await vi.advanceTimersByTimeAsync(0);

    expect(closes).toEqual([{ reason: "connection attempt failed", willReconnect: true }]);
  });

  it("keeps reconnecting when a close listener throws", () => {
    vi.useFakeTimers();
    const transport = make({ baseBackoffMs: 100, random: () => 1 });
    transport.subscribeClose?.(() => {
      throw new Error("listener bug");
    });
    void transport.connect();
    FakeWebSocket.fire(lastSocket(), "close", { code: 1006 });

    expect(transport.getStatus?.()).toBe("reconnecting");
    vi.advanceTimersByTime(100);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("accepts the platform WebSocket constructor without a cast", () => {
    const ctor: WebSocketCtor = WebSocket;
    expect(ctor).toBe(WebSocket);
  });
});

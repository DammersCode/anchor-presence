import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "@anchor-presence/core";
import { createWebSocketTransport } from "../src/transport";
import type { WebSocketLike } from "../src/transport";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  static fire(instance: FakeWebSocket, kind: "open" | "close" | "error" | "message", payload?: unknown): void {
    if (kind === "open") {
      instance.readyState = FakeWebSocket.OPEN;
      instance.onopen?.();
    } else if (kind === "close") {
      instance.readyState = FakeWebSocket.CLOSED;
      instance.onclose?.();
    } else if (kind === "error") {
      instance.onerror?.();
    } else {
      instance.onmessage?.({ data: payload });
    }
  }

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: null | (() => void) = null;
  onclose: null | (() => void) = null;
  onerror: null | (() => void) = null;
  onmessage: null | ((event: { data: unknown }) => void) = null;
  binaryType = "";
  sent: Uint8Array[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBufferView): void {
    this.sent.push(data as Uint8Array);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

const TEST_URL = "ws://relay.test/?room=main";

type MakeOverrides = { reconnect?: boolean; baseBackoffMs?: number; maxBackoffMs?: number };

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

    void transport.connect?.();
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
    const transport = make({ baseBackoffMs: 200, maxBackoffMs: 1000 });
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
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import type { TransportClose } from "@anchor-presence/core";
import { createDomBinding, createWebSocketTransport } from "../src/index";
import type { WebSocketLike } from "../src/index";

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: WebSocketLike["onopen"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  binaryType = "";
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
}

afterEach(() => {
  FakeSocket.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dom docs samples", () => {
  it("binding.mdx: dispose keeps the local cursor on peers only with keepLocalCursor", () => {
    vi.useFakeTimers();
    const { a, b } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const peer = createPresenceClient({ transport: b });
    const binding = createDomBinding(client);
    const peerCursor = () =>
      peer.getRemoteSnapshot().find((p) => p.clientId === client.clientId)?.cursor ?? null;

    client.updateLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    vi.advanceTimersByTime(1000);
    expect(peerCursor()).not.toBeNull();

    binding.dispose({ keepLocalCursor: true });
    const nextBinding = createDomBinding(client, { resolution: { hitTest: true } });
    vi.advanceTimersByTime(1000);
    expect(peerCursor()).not.toBeNull();

    nextBinding.dispose();
    vi.advanceTimersByTime(1000);
    expect(peerCursor()).toBeNull();
    client.dispose();
    peer.dispose();
  });

  it("websocket-transport.mdx: shouldReconnect stops on 4007 and keeps retrying on 1006", () => {
    vi.useFakeTimers();
    const NO_RETRY_CODES = [1008, 4004, 4006, 4007];

    const transport = createWebSocketTransport({
      url: "wss://relay.example.com/?room=main",
      shouldReconnect: (close) => close.code === undefined || !NO_RETRY_CODES.includes(close.code),
      WebSocketCtor: FakeSocket,
    });
    void transport.connect();
    FakeSocket.instances.at(-1)!.onclose?.({ code: 1006 });
    expect(transport.getStatus?.()).toBe("reconnecting");
    vi.advanceTimersByTime(10_000);
    FakeSocket.instances.at(-1)!.onclose?.({ code: 4007 });
    expect(transport.getStatus?.()).toBe("disconnected");
  });

  it("websocket-transport.mdx: subscribeClose reports a final close", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = createWebSocketTransport({
      url: "wss://relay.example.com/?room=main",
      WebSocketCtor: FakeSocket,
    });
    const seen: TransportClose[] = [];
    transport.subscribeClose?.((close) => seen.push(close));

    transport.subscribeClose?.((close) => {
      if (!close.willReconnect) {
        console.warn(`Relay closed the connection: ${close.code ?? "no code"} ${close.reason ?? ""}`);
      }
    });

    void transport.connect();
    FakeSocket.instances.at(-1)!.onclose?.({ code: 4006, reason: "auth" });
    expect(seen).toEqual([{ code: 4006, reason: "auth", willReconnect: false }]);
    expect(warn).toHaveBeenCalledWith("Relay closed the connection: 4006 auth");
    warn.mockRestore();
  });

  it("websocket-transport.mdx: throws a TypeError without url when window is missing", () => {
    vi.stubGlobal("window", undefined);
    expect(() => createWebSocketTransport()).toThrow(TypeError);
  });

  it("api/websocket-transport.mdx: accepts the platform WebSocket constructor", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const transport = createWebSocketTransport({
      url: "wss://relay.example.com/?room=main",
      WebSocketCtor: WebSocket,
    });
    void transport.connect();
    expect(FakeSocket.instances[0]?.url).toBe("wss://relay.example.com/?room=main");
    void transport.disconnect();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorPosition, PresenceClient } from "@anchor-presence/core";
import { createAnchorRegistry } from "../src/registry";
import type { AnchorRegistry } from "../src/registry";
import { attachPointerSource } from "../src/pointer";
import { createWebSocketTransport } from "../src/transport";
import type { WebSocketCtor, WebSocketLike } from "../src/transport";
import { createBroadcastChannelTransport } from "../src/broadcast-transport";

it("broadcast: drops a posted payload that is not a byte view", async () => {
  const name = `gap-${Math.random()}`;
  const a = createBroadcastChannelTransport(name);
  const b = createBroadcastChannelTransport(name);
  void a.connect();
  void b.connect();
  const seen: number[][] = [];
  b.subscribe((data) => seen.push([...data]));
  const raw = new BroadcastChannel(name);
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no target origin
  raw.postMessage({ from: "intruder", data: "not bytes" });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no target origin
  raw.postMessage({ from: "intruder", data: { length: 3 } });
  void a.send(new Uint8Array([7]));
  await new Promise((resolve) => setTimeout(resolve, 50));
  raw.close();
  void a.disconnect();
  void b.disconnect();
  expect(seen).toEqual([[7]]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  });
}

function makeClient(): { client: PresenceClient; samples: (CursorPosition | null)[] } {
  const samples: (CursorPosition | null)[] = [];
  const client = {
    setLocalCursor: (cursor: CursorPosition | null) => samples.push(cursor),
    registerTeardown: () => () => {},
  } as unknown as PresenceClient;
  return { client, samples };
}

function pointer(
  type: string,
  target: Element,
  init: { clientX: number; clientY: number; timeStamp?: number },
  EventCtor: typeof Event = Event,
): void {
  const event = new EventCtor(type, { bubbles: true, composed: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerType: { value: "mouse" },
    pointerId: { value: 1 },
    ...(init.timeStamp === undefined ? {} : { timeStamp: { value: init.timeStamp } }),
  });
  target.dispatchEvent(event);
}

describe("pointer source", () => {
  let registry: AnchorRegistry;
  beforeEach(() => {
    document.body.innerHTML = "";
    registry = createAnchorRegistry();
  });

  it("rounds u and v to four decimals", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 3, height: 3 });
    registry.register("a", el);
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });
    pointer("pointermove", el, { clientX: 1, clientY: 2 });
    expect(samples[0]?.anchors[0]).toEqual({ id: "a", u: 0.3333, v: 0.6667 });
    handle.detach();
  });

  it("runs a fresh hit test after pointerup, even within 50 ms", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);
    el.hasPointerCapture = () => true;
    const hit = vi.fn(() => el);
    document.elementFromPoint = hit;
    const { client } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });
    pointer("pointermove", el, { clientX: 5, clientY: 5, timeStamp: 1000 });
    pointer("pointerup", el, { clientX: 5, clientY: 5, timeStamp: 1005 });
    pointer("pointermove", el, { clientX: 5, clientY: 5, timeStamp: 1010 });
    expect(hit).toHaveBeenCalledTimes(2);
    handle.detach();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("resolves an anchor inside an iframe document", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow as Window & typeof globalThis;
    const doc = frameWindow.document;
    const el = doc.createElement("div");
    doc.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4, root: doc, window: frameWindow });
    pointer("pointermove", el, { clientX: 50, clientY: 50 }, frameWindow.Event);
    expect(samples[0]?.anchors.map((anchor) => anchor.id)).toEqual(["a"]);
    handle.detach();
  });

  it("walks out of a shadow root of an iframe to the host anchor", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const doc = (iframe.contentWindow as Window).document;
    const host = doc.createElement("div");
    doc.body.append(host);
    const inner = doc.createElement("span");
    host.attachShadow({ mode: "open" }).append(inner);
    registry.register("host", host);
    expect(registry.ancestors(inner).map((entry) => entry.id)).toEqual(["host"]);
  });
});

class FakeSocket implements WebSocketLike {
  static last: FakeSocket | null = null;
  readyState = 0;
  binaryType = "";
  bufferedAmount = 0;
  onopen: null | (() => void) = null;
  onclose: null | ((event: { code?: number }) => void) = null;
  onerror: null | (() => void) = null;
  onmessage: null | ((event: { data: unknown }) => void) = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(): void {}
  close(): void {}
}

function relay(steps: Array<"fail" | "open-then-close">): string {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const transport = createWebSocketTransport({
    url: "ws://relay.test/?room=main",
    WebSocketCtor: FakeSocket as unknown as WebSocketCtor,
    random: () => 0,
  });
  void transport.connect();
  for (const step of steps) {
    const socket = FakeSocket.last as FakeSocket;
    if (step === "open-then-close") socket.onopen?.();
    socket.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(10_000);
  }
  void transport.disconnect();
  return warn.mock.calls.flat().join(" ");
}

describe("WebSocket transport warnings", () => {
  it("does not count a connection that opened as a failed attempt", () => {
    expect(relay(["open-then-close", "open-then-close", "open-then-close", "open-then-close"])).not.toMatch(
      /failed 4 times in a row/u,
    );
  });

  it("restarts the failed-attempt count after a connection opens", () => {
    expect(relay(["fail", "fail", "fail", "open-then-close", "fail", "fail", "fail"])).not.toMatch(
      /failed 4 times in a row/u,
    );
  });

  it("warns that url overrides port and path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createWebSocketTransport({ url: "ws://relay.test/", port: 1234, path: "/x" });
    expect(warn.mock.calls.flat().join(" ")).toMatch(/ignores host, port and path/u);
  });
});

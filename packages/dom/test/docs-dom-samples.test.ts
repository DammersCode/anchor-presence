import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createInMemoryPair, createPresenceClient, linearInterpolator } from "@anchor-presence/core";
import type { InterpolatorFactory, TransportClose } from "@anchor-presence/core";
import {
  CURSOR_MARKER_ATTRIBUTE,
  createBroadcastChannelTransport,
  createDomBinding,
  createWebSocketTransport,
} from "../src/index";
import type {
  ResolvedCursor,
  CafLike,
  DomBinding,
  MutationObserverCtor,
  MutationObserverLike,
  RafLike,
  ResizeObserverCtor,
  ResizeObserverLike,
  VisibilityPolicy,
  WebSocketLike,
} from "../src/index";

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

    client.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
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

  it("websocket-transport.mdx: shouldReconnect stops on 4001 and keeps retrying on 1006", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);

    // Copied from apps/docs/content/docs/dom/websocket-transport.mdx (Stop reconnecting).
    // oxlint-disable-next-line unicorn/prefer-set-has -- word-for-word copy of the docs sample
    const NO_RETRY_CODES = [1008, 4001, 4004, 4006, 4007];

    const transport = createWebSocketTransport({
      url: "wss://relay.example.com/?room=main",
      shouldReconnect: (close) => close.code === undefined || !NO_RETRY_CODES.includes(close.code),
    });

    void transport.connect();
    FakeSocket.instances.at(-1)!.onclose?.({ code: 1006 });
    expect(transport.getStatus?.()).toBe("reconnecting");
    vi.advanceTimersByTime(10_000);
    FakeSocket.instances.at(-1)!.onclose?.({ code: 4001 });
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

  it("websocket-transport.mdx: the basic sample connects a client to one room", () => {
    vi.stubGlobal("WebSocket", FakeSocket);

    // Copied from apps/docs/content/docs/dom/websocket-transport.mdx (Basic use).
    const transport = createWebSocketTransport({ url: "wss://relay.example.com/?room=room-42" });
    const client = createPresenceClient({ transport });

    expect(FakeSocket.instances[0]?.url).toBe("wss://relay.example.com/?room=room-42");
    client.dispose();
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

function rafQueue() {
  const queue = new Map<number, (timestampMs: number) => void>();
  let next = 1;
  const raf: RafLike = (callback) => {
    queue.set(next, callback);
    return next++;
  };
  const caf: CafLike = (handle) => {
    queue.delete(handle);
  };
  const flush = () => {
    const pending = [...queue.values()];
    queue.clear();
    for (const callback of pending) callback(0);
  };
  return { raf, caf, flush };
}

describe("binding docs", () => {
  it("binding.mdx: the create sample renders each visible cursor", () => {
    vi.useFakeTimers();
    const { a, b } = createInMemoryPair();
    const myTransport = a;
    const rendered: string[] = [];
    const renderCursor = (clientId: string, x: number, y: number) => rendered.push(`${clientId}@${x},${y}`);
    const { raf, caf, flush } = rafQueue();

    // Copied from apps/docs/content/docs/dom/binding.mdx (Create a binding), plus a frame stub.
    const client = createPresenceClient({ transport: myTransport });
    const binding = createDomBinding(client, { environment: { raf, caf } });

    binding.subscribe(() => {
      for (const cursor of binding.getSnapshot()) {
        if (cursor.visible) renderCursor(cursor.clientId, cursor.x, cursor.y);
      }
    });

    const peer = createPresenceClient({ transport: b });
    peer.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    vi.advanceTimersByTime(100);
    flush();
    expect(rendered.at(-1)?.startsWith(`${peer.clientId}@`)).toBe(true);
    binding.dispose();
    client.dispose();
    peer.dispose();
  });

  it("binding.mdx: throws a TypeError for a bad anchorAttribute or a non-integer maxAnchors", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    expect(() => createDomBinding(client, { anchorAttribute: "data_anchor" })).toThrow(TypeError);
    expect(() => createDomBinding(client, { anchorAttribute: "1-anchor" })).toThrow(TypeError);
    expect(() => createDomBinding(client, { maxAnchors: 2.5 })).toThrow(TypeError);
    expect(() => createDomBinding(client, { maxAnchors: Number.NaN })).toThrow(TypeError);
    createDomBinding(client, { anchorAttribute: "anchor", maxAnchors: 20 }).dispose();
    client.dispose();
  });

  it("binding.mdx: drawCursors keeps one marked element per visible cursor", () => {
    vi.useFakeTimers();
    const { a, b } = createInMemoryPair();
    const { raf, caf, flush } = rafQueue();
    const client = createPresenceClient({ transport: a });
    const domBinding = createDomBinding(client, { environment: { raf, caf } });

    // Copied from apps/docs/content/docs/dom/binding.mdx (Draw cursors without React).
    function drawCursors(binding: DomBinding, layer: HTMLElement): () => void {
      const elements = new Map<string, HTMLElement>();
      return binding.subscribe(() => {
        const shown = new Set<string>();
        for (const cursor of binding.getSnapshot()) {
          if (!cursor.visible) continue;
          shown.add(cursor.clientId);
          let element = elements.get(cursor.clientId);
          if (element === undefined) {
            element = document.createElement("div");
            element.setAttribute(CURSOR_MARKER_ATTRIBUTE, "");
            element.setAttribute("aria-hidden", "true");
            element.className = "remote-cursor";
            layer.append(element);
            elements.set(cursor.clientId, element);
          }
          element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
        }
        for (const [clientId, element] of elements) {
          if (shown.has(clientId)) continue;
          element.remove();
          elements.delete(clientId);
        }
      });
    }

    const layer = document.createElement("div");
    document.body.append(layer);
    const stop = drawCursors(domBinding, layer);
    const peer = createPresenceClient({ transport: b });
    peer.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    vi.advanceTimersByTime(100);
    flush();
    expect(layer.children).toHaveLength(1);
    expect(layer.firstElementChild?.hasAttribute(CURSOR_MARKER_ATTRIBUTE)).toBe(true);

    domBinding.dispose();
    expect(layer.children).toHaveLength(0);
    stop();
    layer.remove();
    client.dispose();
    peer.dispose();
  });

  it("binding.mdx: the invalidate sample marks the layout dirty after the fonts load", async () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const binding = createDomBinding(client);
    const invalidate = vi.spyOn(binding, "invalidate");
    const document = { fonts: { ready: Promise.resolve() } };

    // Copied from apps/docs/content/docs/dom/binding.mdx (invalidate).
    await document.fonts.ready.then(() => {
      binding.invalidate("fonts-loaded");
    });

    expect(invalidate).toHaveBeenCalledWith("fonts-loaded");
    binding.dispose();
    client.dispose();
  });
});

describe("binding api docs: host types", () => {
  // Copied from apps/docs/content/docs/dom/api/binding.mdx (Host types).
  type DocRafLike = (callback: (timestampMs: number) => void) => number;
  type DocCafLike = (handle: number) => void;

  type DocResizeObserverLike = {
    observe(target: Element): void;
    unobserve(target: Element): void;
    disconnect(): void;
  };
  type DocResizeObserverCtor = new (callback: () => void) => DocResizeObserverLike;

  type DocMutationObserverLike = {
    observe(target: Node, options: MutationObserverInit): void;
    unobserve?(target: Node): void;
    disconnect(): void;
  };
  type DocMutationObserverCtor = new (
    callback: (records?: MutationRecord[]) => void,
  ) => DocMutationObserverLike;

  it("matches the exported host types, and the browser globals fit them", () => {
    expectTypeOf<DocRafLike>().toEqualTypeOf<RafLike>();
    expectTypeOf<DocCafLike>().toEqualTypeOf<CafLike>();
    expectTypeOf<DocResizeObserverLike>().toEqualTypeOf<ResizeObserverLike>();
    expectTypeOf<DocResizeObserverCtor>().toEqualTypeOf<ResizeObserverCtor>();
    expectTypeOf<DocMutationObserverLike>().toEqualTypeOf<MutationObserverLike>();
    expectTypeOf<DocMutationObserverCtor>().toEqualTypeOf<MutationObserverCtor>();
    expectTypeOf(requestAnimationFrame).toMatchTypeOf<RafLike>();
    expectTypeOf(cancelAnimationFrame).toMatchTypeOf<CafLike>();
    expectTypeOf(MutationObserver).toMatchTypeOf<MutationObserverCtor>();
    expectTypeOf<typeof ResizeObserver>().toMatchTypeOf<ResizeObserverCtor>();
  });
});

describe("dom docs samples: pages without a guide test", () => {
  it("occlusion-and-scroll.mdx: clippedPointPolicy hides a clipped or hidden cursor", () => {
    // Copied from apps/docs/content/docs/dom/occlusion-and-scroll.mdx (Use pointVisible).
    const clippedPointPolicy: VisibilityPolicy = ({ resolution }) =>
      !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";

    const presence = { version: 1, clientId: "a", session: "s", sequence: 1, cursor: null } as const;
    const decide = (tier: "anchor" | "hidden", pointVisible: boolean) =>
      clippedPointPolicy({ presence, resolution: { tier, anchorId: null, pointVisible } });
    expect(decide("anchor", true)).toBe("show");
    expect(decide("anchor", false)).toBe("hide");
    expect(decide("hidden", true)).toBe("hide");
  });

  it("pointer-capture.mdx: captureFocus publishes a cursor for the focused element", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const setLocalCursor = vi.spyOn(client, "setLocalCursor");
    const button = document.createElement("button");
    button.getBoundingClientRect = () => new DOMRect(10, 10, 20, 20);
    document.body.append(button);

    // Copied from apps/docs/content/docs/dom/pointer-capture.mdx.
    const binding = createDomBinding(client, { captureFocus: true });

    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(setLocalCursor.mock.calls.at(-1)?.[0]?.viewport).toBeDefined();
    binding.dispose();
    client.dispose();
    button.remove();
  });

  it("resolution.mdx: the tier sample reads each cursor of the snapshot", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const binding = createDomBinding(client);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    // Copied from apps/docs/content/docs/dom/resolution.mdx.
    for (const cursor of binding.getSnapshot()) {
      if (cursor.tier === "viewport") console.debug(`${cursor.clientId} has no shared anchor`);
    }

    expect(debug).not.toHaveBeenCalled();
    binding.dispose();
    client.dispose();
  });

  it("build-a-framework-adapter.mdx: observeCursors writes the first and each later snapshot", () => {
    // Copied from apps/docs/content/docs/core/build-a-framework-adapter.mdx (The bridge).
    function observeCursors(binding: DomBinding, write: (cursors: ResolvedCursor[]) => void): () => void {
      write(binding.getSnapshot());
      return binding.subscribe(() => write(binding.getSnapshot()));
    }

    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const binding = createDomBinding(client);
    const writes: ResolvedCursor[][] = [];
    const stop = observeCursors(binding, (cursors) => writes.push(cursors));
    binding.invalidate();
    stop();
    expect(writes).toEqual([[]]);
    binding.dispose();
    client.dispose();
  });

  it("motion.mdx: the binding eases each peer with the custom interpolatorFactory", () => {
    vi.useFakeTimers();
    const { a, b } = createInMemoryPair();
    const mySpringInterpolatorFactory = vi.fn<InterpolatorFactory>(() => linearInterpolator(200));
    const client = createPresenceClient({ transport: a });

    // Copied from apps/docs/content/docs/dom/motion.mdx (Choose a custom interpolator).
    const binding = createDomBinding(client, {
      resolution: { interpolatorFactory: mySpringInterpolatorFactory },
    });

    const peer = createPresenceClient({ transport: b });
    peer.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    vi.advanceTimersByTime(100);
    expect(mySpringInterpolatorFactory).toHaveBeenCalled();
    binding.dispose();
    client.dispose();
    peer.dispose();
  });

  it("broadcast-channel-transport.mdx: two clients on one channel see each other", async () => {
    vi.useFakeTimers();
    // Copied from apps/docs/content/docs/dom/broadcast-channel-transport.mdx (Usage).
    const client = createPresenceClient({ transport: createBroadcastChannelTransport("presence-demo") });

    const peer = createPresenceClient({ transport: createBroadcastChannelTransport("presence-demo") });
    peer.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();
    await vi.waitFor(() => expect(client.getRemotePresence()).toHaveLength(1));
    client.dispose();
    peer.dispose();
  });
});

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Leading whitespace differs between a sample and its copy inside a block, so compare trimmed lines.
const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

// Returns the ts block of `page` that contains `marker`, without import lines.
function docSample(page: string, marker: string): string {
  const markdown = readRepoFile(`apps/docs/content/docs/${page}`);
  const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${page}`);
  return block;
}

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/dom/test/docs-dom-samples.test.ts"));
    const samples = [
      docSample("dom/binding.mdx", "function drawCursors"),
      docSample("core/build-a-framework-adapter.mdx", "function observeCursors"),
      docSample("dom/occlusion-and-scroll.mdx", "const clippedPointPolicy"),
      docSample("dom/websocket-transport.mdx", "const NO_RETRY_CODES"),
      docSample("dom/websocket-transport.mdx", "room=room-42"),
      docSample("dom/motion.mdx", "interpolatorFactory: mySpringInterpolatorFactory"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});

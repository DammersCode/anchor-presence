import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryPair,
  createPresenceClient,
  MAX_EVENT_TYPE_LENGTH,
  type ConnectionStatus,
  type LiveCursorTransport,
  type PeerChange,
  type RemoteEvent,
  type TransportClose,
} from "@anchor-presence/core";

const cursor = { anchors: [{ id: "doc", u: 0.5, v: 0.5 }] };

function connectedPair() {
  const pair = createInMemoryPair();
  const a = createPresenceClient({ transport: pair.a });
  const b = createPresenceClient({ transport: pair.b });
  return { pair, a, b };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("presence client docs: events", () => {
  it("delivers events to peers and never to the sender", () => {
    const { a: client, b: peer } = connectedPair();
    const waves: string[] = [];
    const received: RemoteEvent[] = [];
    const showWave = (clientId: string) => waves.push(clientId);
    peer.subscribeEvents((event) => received.push(event));

    // Copied from apps/docs/content/docs/core/presence-client.mdx (Events).
    const unsubscribe = client.subscribeEvents((event) => {
      if (event.type === "wave") showWave(event.clientId);
    });

    client.sendEvent("wave");
    client.sendEvent("reaction", { emoji: "tada" });

    expect(waves).toEqual([]);
    expect(received).toEqual([
      { type: "wave", clientId: client.clientId },
      { type: "reaction", data: { emoji: "tada" }, clientId: client.clientId },
    ]);
    peer.sendEvent("wave");
    expect(waves).toEqual([peer.clientId]);
    unsubscribe();
    client.dispose();
    peer.dispose();
  });

  it("returns false when not connected, for a bad type, or above the field limits", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient({ transport: pair.a, autoConnect: false });
    expect(client.sendEvent("wave")).toBe(false);
    void pair.a.connect();
    expect(client.sendEvent("")).toBe(false);
    expect(client.sendEvent("x".repeat(65))).toBe(false);
    expect(client.sendEvent("x".repeat(64))).toBe(true);
    expect(client.sendEvent("big", "x".repeat(9000))).toBe(false);
    client.dispose();
    expect(client.sendEvent("wave")).toBe(false);
  });

  it("drops events above a burst of 20 per sender on the receiver", () => {
    const { a: client, b: peer } = connectedPair();
    let count = 0;
    peer.subscribeEvents(() => count++);
    for (let i = 0; i < 25; i++) expect(client.sendEvent("ping")).toBe(true);
    expect(count).toBe(20);
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 25; i++) client.sendEvent("ping");
    expect(count).toBe(30);
    client.dispose();
    peer.dispose();
  });

  it("never adds the sender of an event to the store", () => {
    const { a: client, b: peer } = connectedPair();
    client.sendEvent("wave");
    expect(peer.getRemotePresence()).toEqual([]);
    client.dispose();
    peer.dispose();
  });
});

describe("presence client docs: leave and close", () => {
  it("removes the client on leave and announces it again on the next publish", () => {
    const { a: client, b: peer } = connectedPair();
    const changes: PeerChange["type"][] = [];
    peer.subscribePeers((change) => changes.push(change.type));
    client.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);

    client.leave();
    expect(peer.getRemotePresence()).toEqual([]);

    client.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(changes).toEqual(["join", "leave", "join"]);
    expect(peer.getRemotePresence()).toHaveLength(1);
    client.dispose();
    peer.dispose();
  });

  it("announces a client again on the next heartbeat after leave", () => {
    const { a: client, b: peer } = connectedPair();
    client.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    client.leave();
    expect(peer.getRemotePresence()).toEqual([]);
    vi.advanceTimersByTime(10_000);
    expect(peer.getRemotePresence()).toHaveLength(1);
    client.dispose();
    peer.dispose();
  });

  it("sends no leave while not connected", () => {
    const { pair, a: client, b: peer } = connectedPair();
    client.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    void pair.a.disconnect();
    client.leave();
    expect(peer.getRemotePresence()).toHaveLength(1);
    client.dispose();
    peer.dispose();
  });

  it("reports a close reason through subscribeClose", () => {
    const pair = createInMemoryPair();
    const closeListeners = new Set<(close: TransportClose) => void>();
    const transport: LiveCursorTransport = {
      ...pair.a,
      subscribeClose(listener) {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
    };
    const client = createPresenceClient({ transport });
    const offline: Array<[number | undefined, string | undefined]> = [];
    const showOffline = (code: number | undefined, reason: string | undefined) =>
      offline.push([code, reason]);

    // Copied from apps/docs/content/docs/core/presence-client.mdx (Close reasons).
    client.subscribeClose((close) => {
      if (!close.willReconnect) showOffline(close.code, close.reason);
    });

    for (const listener of closeListeners) listener({ code: 1006, willReconnect: true });
    for (const listener of closeListeners)
      listener({ code: 4006, reason: "bad token", willReconnect: false });
    expect(offline).toEqual([[4006, "bad token"]]);
    client.dispose();
  });

  it("returns a no-op unsubscribe when the transport has no subscribeClose", () => {
    const { a: client } = connectedPair();
    const unsubscribe = client.subscribeClose(() => {});
    expect(() => unsubscribe()).not.toThrow();
    client.dispose();
  });
});

describe("presence client docs: ids", () => {
  it("defaults to 12 URL-safe characters", () => {
    const { a: client } = connectedPair();
    expect(client.clientId).toMatch(/^[A-Za-z0-9_-]{12}$/u);
    expect(client.session).toMatch(/^[A-Za-z0-9_-]{12}$/u);
    client.dispose();
  });

  it("uses the idFactory for clientId and session", () => {
    const { a: myTransport } = createInMemoryPair();

    // Copied from apps/docs/content/docs/core/presence-client.mdx (IDs).
    const client = createPresenceClient({
      transport: myTransport,
      idFactory: () => crypto.randomUUID(),
    });

    expect(client.clientId).toHaveLength(36);
    expect(client.session).toHaveLength(36);
    expect(client.session).not.toBe(client.clientId);
    client.dispose();
  });
});

describe("remote presence docs", () => {
  it("reports join, update and leave, and nothing for a cursor move", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient({ transport: pair.a });
    const peer = createPresenceClient({ transport: pair.b, user: { name: "Bo" } });
    const toasts: string[] = [];
    const changes: PeerChange[] = [];
    const showToast = (text: string) => toasts.push(text);
    client.subscribePeers((change) => changes.push(change));

    // Copied from apps/docs/content/docs/core/remote-presence.mdx (Peer changes).
    const unsubscribe = client.subscribePeers((change) => {
      if (change.type === "join") showToast(`${change.clientId} joined`);
    });

    peer.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    peer.updateLocalCursor({ anchors: [{ id: "doc", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(50);
    peer.setUser({ name: "Bob" });
    vi.advanceTimersByTime(50);
    peer.dispose();

    expect(toasts).toEqual([`${peer.clientId} joined`]);
    expect(changes.map((change) => change.type)).toEqual(["join", "update", "leave"]);
    unsubscribe();
    client.dispose();
  });

  it("answers a new peer with one full publish within 500 ms", () => {
    const pair = createInMemoryPair();
    const early = createPresenceClient({ transport: pair.a, user: { name: "Ada" } });
    early.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    const late = createPresenceClient({ transport: pair.b, user: { name: "Bo" } });
    late.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(late.getRemotePresence()).toEqual([]);
    vi.advanceTimersByTime(550);
    expect(late.getRemotePresence()).toMatchObject([{ clientId: early.clientId, user: { name: "Ada" } }]);
    early.dispose();
    late.dispose();
  });

  it("removes peers no heartbeat confirms within 2 * heartbeatMs + 5 s after a reconnect", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient({ transport: pair.a, heartbeatMs: 1000 });
    const peer = createPresenceClient({ transport: pair.b });
    peer.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    void pair.b.disconnect();
    peer.dispose();
    void pair.a.disconnect();
    void pair.a.connect();
    vi.advanceTimersByTime(6000);
    expect(client.getRemotePresence()).toHaveLength(1);
    vi.advanceTimersByTime(1000 + 7500);
    expect(client.getRemotePresence()).toEqual([]);
    client.dispose();
  });

  it("marks a still peer idle while its heartbeats keep arriving", () => {
    const { a: client, b: peer } = connectedPair();
    peer.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(25_000);
    expect(client.getRemotePresence()).toMatchObject([{ clientId: peer.clientId, idle: true }]);
    client.dispose();
    peer.dispose();
  });
});

describe("validation docs: remote user and context", () => {
  it("keeps optional scalar keys, removes object keys and drops a value with another shape", () => {
    const pair = createInMemoryPair();
    const myTransport = pair.a;

    // Copied from apps/docs/content/docs/core/validation.mdx (Remote user and context).
    const client = createPresenceClient({
      transport: myTransport,
      user: { name: "Ada", color: "#e11d48" },
    });

    const peer = createPresenceClient<unknown, unknown>({
      transport: pair.b,
      user: { name: "Bo", color: "#0ea5e9", admin: true, roles: { all: true } },
    });
    peer.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(client.getRemotePresence()[0]?.user).toEqual({ name: "Bo", color: "#0ea5e9", admin: true });

    peer.setUser({ name: 42 });
    vi.advanceTimersByTime(50);
    expect(client.getRemotePresence()[0]?.user).toEqual({ name: "Bo", color: "#0ea5e9", admin: true });
    client.dispose();
    peer.dispose();
  });

  it("checks context with parseContext on a client with no local value", () => {
    const pair = createInMemoryPair();
    const myTransport = pair.a;

    // Copied from apps/docs/content/docs/core/validation.mdx (Remote user and context).
    const viewer = createPresenceClient<{ page: string }>({
      transport: myTransport,
      parseContext: (value) => {
        const { page } = value as { page?: unknown };
        return typeof page === "string" ? { page } : undefined;
      },
    });

    const peer = createPresenceClient<unknown, unknown>({ transport: pair.b, context: { page: "/docs" } });
    peer.updateLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(viewer.getRemotePresence()[0]?.context).toEqual({ page: "/docs" });

    peer.setContext({ page: 1 });
    vi.advanceTimersByTime(50);
    expect(viewer.getRemotePresence()[0]?.context).toEqual({ page: "/docs" });
    viewer.dispose();
    peer.dispose();
  });
});

describe("custom transport docs: close reasons", () => {
  it("reports a socket close to the client", () => {
    const pair = createInMemoryPair();

    // Copied from apps/docs/content/docs/core/custom-transport.mdx (Close reasons).
    const closeListeners = new Set<(close: TransportClose) => void>();

    function subscribeClose(listener: (close: TransportClose) => void) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    }

    function onSocketClose(event: CloseEvent, willReconnect: boolean) {
      const close: TransportClose = { code: event.code, reason: event.reason, willReconnect };
      for (const listener of closeListeners) listener(close);
    }

    const client = createPresenceClient({ transport: { ...pair.a, subscribeClose } });
    const closes: TransportClose[] = [];
    client.subscribeClose((close) => closes.push(close));
    onSocketClose({ code: 1006, reason: "" } as CloseEvent, true);
    expect(closes).toEqual([{ code: 1006, reason: "", willReconnect: true }]);
    client.dispose();
  });
});

describe("transports docs: interface listing", () => {
  // Copied from apps/docs/content/docs/core/transports.mdx (The LiveCursorTransport interface).
  interface DocLiveCursorTransport {
    connect?(): Promise<void> | void;
    disconnect?(): Promise<void> | void;
    send(data: Uint8Array): Promise<void> | void;
    subscribe(listener: (data: Uint8Array) => void): () => void;
    subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
    subscribeClose?(listener: (close: DocTransportClose) => void): () => void;
    getStatus?(): ConnectionStatus;
    bufferedBytes?(): number;
  }

  type DocTransportClose = { code?: number; reason?: string; willReconnect: boolean };

  it("matches the exported types in both directions", () => {
    const { a } = createInMemoryPair();
    const fromDoc: LiveCursorTransport = a satisfies DocLiveCursorTransport;
    const toDoc: DocLiveCursorTransport = fromDoc;
    const close: TransportClose = { willReconnect: false } satisfies DocTransportClose;
    const docClose: DocTransportClose = close;
    expect(toDoc).toBe(a);
    expect(docClose.willReconnect).toBe(false);
  });
});

describe("protocol docs: constants", () => {
  it("fixes the event type length at 64", () => {
    expect(MAX_EVENT_TYPE_LENGTH).toBe(64);
  });
});

describe("parseEvent doc sample", () => {
  it("builds a client with a parseEvent that checks the data", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient({
      transport,
      parseEvent: (event) => {
        if (event.type !== "reaction") return undefined;
        const emoji = (event.data as { emoji?: unknown } | undefined)?.emoji;
        return typeof emoji === "string" ? { ...event, data: { emoji: emoji.slice(0, 2) } } : undefined;
      },
    });
    expect(client.getRemotePresence()).toEqual([]);
    client.dispose();
  });
});

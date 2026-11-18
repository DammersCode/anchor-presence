import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  binaryCodec,
  createInMemoryPair,
  createPresenceClient,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_IDLE_AFTER_MS,
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_FIELD_DEPTH,
  DEFAULT_MAX_MESSAGE_BYTES,
  DEFAULT_MAX_REMOTE_CLIENTS,
  DEFAULT_MAX_SEQUENCE,
  DEFAULT_MAX_SESSION_LENGTH,
  DEFAULT_PUBLISH_INTERVAL_MS,
  DEFAULT_STALE_TIMEOUT_MS,
  isDevMode,
  jsonCodec,
  linearInterpolator,
  MAX_EVENT_TYPE_LENGTH,
  noneInterpolator,
  RemotePresenceStore,
  validatePresence,
  type ConnectionStatus,
  type CursorCodec,
  type CursorPresence,
  type Interpolator,
  type InterpolatorFactory,
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

    // Copied from apps/docs/content/docs/core/events.mdx (Send and receive events).
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
    client.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);

    client.leave();
    expect(peer.getRemotePresence()).toEqual([]);

    client.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(changes).toEqual(["join", "leave", "join"]);
    expect(peer.getRemotePresence()).toHaveLength(1);
    client.dispose();
    peer.dispose();
  });

  it("announces a client again on the next heartbeat after leave", () => {
    const { a: client, b: peer } = connectedPair();
    client.setLocalCursor(cursor);
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
    client.setLocalCursor(cursor);
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

    peer.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    peer.setLocalCursor({ anchors: [{ id: "doc", u: 0.1, v: 0.1 }] });
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
    early.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    const late = createPresenceClient({ transport: pair.b, user: { name: "Bo" } });
    late.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(late.getRemotePresence()).toEqual([]);
    vi.advanceTimersByTime(550);
    expect(late.getRemotePresence()).toMatchObject([{ clientId: early.clientId, user: { name: "Ada" } }]);
    early.dispose();
    late.dispose();
  });

  it("removes peers no heartbeat confirms within 2 * heartbeatIntervalMs + 5 s after a reconnect", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient({ transport: pair.a, heartbeatIntervalMs: 1000 });
    const peer = createPresenceClient({ transport: pair.b });
    peer.setLocalCursor(cursor);
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
    peer.setLocalCursor(cursor);
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
    peer.setLocalCursor(cursor);
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
    peer.setLocalCursor(cursor);
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

  it("matches the protocol.mdx constant table", () => {
    expect([
      DEFAULT_MAX_CLIENT_ID_LENGTH,
      DEFAULT_MAX_SESSION_LENGTH,
      DEFAULT_MAX_SEQUENCE,
      DEFAULT_MAX_ANCHORS,
      DEFAULT_MAX_ANCHOR_ID_LENGTH,
      DEFAULT_MAX_FIELD_BYTES,
      DEFAULT_MAX_FIELD_DEPTH,
      DEFAULT_MAX_MESSAGE_BYTES,
    ]).toEqual([128, 64, 2147483647, 8, 256, 8192, 8, 32768]);
  });
});

describe("parseEvent doc sample", () => {
  it("keeps the first emoji of a reaction, with its skin tone", () => {
    const { a: myTransport, b } = createInMemoryPair();
    const client = createPresenceClient({
      transport: myTransport,
      parseEvent: (event) => {
        if (event.type !== "reaction") return undefined;
        const emoji = (event.data as { emoji?: unknown } | undefined)?.emoji;
        if (typeof emoji !== "string") return undefined;
        const first = new Intl.Segmenter().segment(emoji).containing(0);
        return first ? { ...event, data: { emoji: first.segment } } : undefined;
      },
    });
    const received: unknown[] = [];
    client.subscribeEvents((event) => received.push(event.data));
    const peer = createPresenceClient({ transport: b, clientId: "peer" });
    peer.sendEvent("reaction", { emoji: "\u{1F44D}\u{1F3FD}\u{1F389}" });
    expect(received).toEqual([{ emoji: "\u{1F44D}\u{1F3FD}" }]);
    peer.dispose();
    client.dispose();
  });
});

const presenceMessage: CursorPresence = {
  version: 1,
  clientId: "peer",
  session: "s1",
  sequence: 1,
  cursor,
};

describe("validation docs: boundary and limits", () => {
  it("drops an oversized frame before decode, and checks the rest", () => {
    // Copied from apps/docs/content/docs/core/validation.mdx (Use validatePresence directly).
    function inspect(frame: Uint8Array) {
      if (frame.byteLength > DEFAULT_MAX_MESSAGE_BYTES) return null;
      return validatePresence(jsonCodec.decode(frame));
    }

    expect(inspect(jsonCodec.encode(presenceMessage))).toEqual(presenceMessage);
    expect(inspect(jsonCodec.encode({ ...presenceMessage, clientId: "" }))).toBeNull();
    const oversized = jsonCodec.encode({
      ...presenceMessage,
      session: "x".repeat(DEFAULT_MAX_MESSAGE_BYTES),
    });
    expect(inspect(oversized)).toBeNull();
    expect(validatePresence(jsonCodec.decode(oversized), { maxSessionLength: Infinity })).not.toBeNull();
  });

  it("lists the default limits and the result of each one", () => {
    expect([
      DEFAULT_MAX_CLIENT_ID_LENGTH,
      DEFAULT_MAX_SESSION_LENGTH,
      DEFAULT_MAX_SEQUENCE,
      DEFAULT_MAX_ANCHORS,
      DEFAULT_MAX_ANCHOR_ID_LENGTH,
      DEFAULT_MAX_FIELD_BYTES,
      DEFAULT_MAX_FIELD_DEPTH,
      DEFAULT_MAX_MESSAGE_BYTES,
    ]).toEqual([128, 64, 2_147_483_647, 8, 256, 8192, 8, 32_768]);

    const anchors = Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, u: 0, v: 0 }));
    expect(validatePresence({ ...presenceMessage, cursor: { anchors } })?.cursor?.anchors).toHaveLength(8);
    const longId = { id: "x".repeat(257), u: 0, v: 0 };
    expect(
      validatePresence({ ...presenceMessage, cursor: { anchors: [longId, anchors[0]] } })?.cursor?.anchors,
    ).toEqual([anchors[0]]);
    const bigUser = { name: "x".repeat(DEFAULT_MAX_FIELD_BYTES) };
    expect(validatePresence({ ...presenceMessage, user: bigUser })).toEqual(presenceMessage);
    const bigEvent = { ...presenceMessage, cursor: null, event: { type: "wave", data: bigUser } };
    expect(validatePresence(bigEvent)).toBeNull();
    expect(validatePresence({ ...presenceMessage, sequence: 1.5 })).toBeNull();
  });

  it("passes validationLimits to the client", () => {
    const { a: myTransport } = createInMemoryPair();

    // Copied from apps/docs/content/docs/core/validation.mdx (ValidationLimits).
    const client = createPresenceClient({
      transport: myTransport,
      validationLimits: { maxAnchors: 4 },
    });

    expect(client.getRemotePresence()).toEqual([]);
    client.dispose();
  });

  it("removes a __proto__ key and keeps extra scalar keys on an empty local object", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient<unknown, unknown>({ transport: pair.a, user: {} });
    void pair.b.send(
      new TextEncoder().encode(
        '{"version":1,"clientId":"p","session":"s","sequence":1,"cursor":null,"user":{"__proto__":{"x":1},"name":"Bo","tags":["a"]}}',
      ),
    );
    const user = client.getRemotePresence()[0]?.user as Record<string, unknown>;
    expect(user).toEqual({ name: "Bo" });
    expect(Object.getPrototypeOf(user)).toBe(Object.prototype);
    client.dispose();
  });
});

describe("remote presence docs: store and samples", () => {
  it("reads the stable snapshot and caps the peers", () => {
    const pair = createInMemoryPair();
    const myTransport = pair.a;
    const logged: unknown[] = [];
    const dropped: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value: unknown) => logged.push(value));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reportMetric = (name: string, clientId: string) => dropped.push(`${name}:${clientId}`);

    // Copied from apps/docs/content/docs/core/remote-presence.mdx (maxRemoteClients).
    const client = createPresenceClient({
      transport: myTransport,
      maxRemoteClients: 200,
      onRemoteClientRejected: ({ clientId }) => reportMetric("presence.remote_client_dropped", clientId),
    });

    // Copied from apps/docs/content/docs/core/remote-presence.mdx (Read remote presence).
    const remotePresences = client.getRemotePresence();
    const unsubscribe = client.subscribeRemote(() => {
      console.log(client.getRemotePresence());
    });

    expect(remotePresences).toEqual([]);
    void pair.b.send(jsonCodec.encode(presenceMessage));
    expect(logged).toHaveLength(1);
    expect(dropped).toEqual([]);
    unsubscribe();
    client.dispose();
  });

  it("holds remote presence without a client and sweeps on a timer", () => {
    // Copied from apps/docs/content/docs/core/remote-presence.mdx (Use the store without a client).
    const store = new RemotePresenceStore({ maxRemoteClients: 200 });
    const sweepTimer = setInterval(() => store.sweep(), 1000);

    function receive(decoded: unknown) {
      const presence = validatePresence(decoded);
      if (presence !== null && presence.event === undefined) store.ingest(presence);
    }

    const changes: PeerChange[] = [];
    store.subscribePeers((change) => changes.push(change));
    receive(presenceMessage);
    receive({ ...presenceMessage, sequence: 2, cursor: null, event: { type: "wave" } });
    expect(store.has("peer", "s1")).toBe(true);
    expect(store.hasActiveCursors()).toBe(true);
    expect(store.getStableSnapshot()[0]?.idle).toBe(false);

    vi.advanceTimersByTime(DEFAULT_IDLE_AFTER_MS + 1000);
    expect(store.getStableSnapshot()[0]?.idle).toBe(true);
    vi.advanceTimersByTime(DEFAULT_STALE_TIMEOUT_MS);
    expect(store.getSnapshot()).toEqual([]);
    expect(changes).toEqual([
      { type: "join", clientId: "peer" },
      { type: "leave", clientId: "peer" },
    ]);
    clearInterval(sweepTimer);
  });

  it("stores an event message as a peer without a cursor when the caller skips the event check", () => {
    const store = new RemotePresenceStore();
    store.ingest({ ...presenceMessage, cursor: null, event: { type: "wave" } });
    expect(store.getSnapshot()[0]?.cursor).toBeNull();
    expect(store.hasActiveCursors()).toBe(false);
  });

  it("expires unconfirmed peers only on a later sweep", () => {
    const store = new RemotePresenceStore();
    store.ingest(presenceMessage);
    store.expireUnlessRefreshed(1000);
    expect(store.has("peer")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(store.has("peer")).toBe(true);
    store.sweep();
    expect(store.has("peer")).toBe(false);
  });
});

describe("presence client docs: setup samples", () => {
  it("creates clients with autoConnect, adaptivePublish and the default codec", () => {
    const pair = createInMemoryPair();
    const myTransport = pair.a;
    const connect = vi.spyOn(myTransport, "connect");

    // Copied from apps/docs/content/docs/core/presence-client.mdx (Connect the transport).
    const client = createPresenceClient({ transport: myTransport, autoConnect: false });
    void myTransport.connect();

    expect(connect).toHaveBeenCalledTimes(1);
    client.dispose();

    // Copied from apps/docs/content/docs/core/presence-client.mdx (Publish rate).
    const adaptive = createPresenceClient({
      transport: myTransport,
      adaptivePublish: { highWatermarkBytes: 64 * 1024 },
    });
    adaptive.dispose();
  });

  it("runs a registered teardown on dispose and reports the status", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const statuses: ConnectionStatus[] = [];
    client.subscribeStatus((status) => statuses.push(status));
    const teardown = vi.fn();
    client.registerTeardown(teardown);
    expect(client.getStatus()).toBe("connected");
    expect(client.hasActiveCursors?.()).toBe(false);
    client.dispose();
    expect(teardown).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    client.registerTeardown(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("isDevMode is true outside production, and the sample logs only then", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    // Copied from apps/docs/content/docs/core/presence-client.mdx (Development mode).
    if (isDevMode()) console.debug("[presence] debug overlay on");

    expect(isDevMode()).toBe(true);
    expect(debug).toHaveBeenCalledTimes(1);
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevMode()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("warns on each setUser call that breaks the field limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    client.setUser({ name: "x".repeat(DEFAULT_MAX_FIELD_BYTES) });
    client.setUser({ name: "y".repeat(DEFAULT_MAX_FIELD_BYTES) });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("outbound user"))).toHaveLength(2);
    client.dispose();
  });

  it("lists the client and store constants", () => {
    expect([
      DEFAULT_PUBLISH_INTERVAL_MS,
      DEFAULT_HEARTBEAT_INTERVAL_MS,
      DEFAULT_STALE_TIMEOUT_MS,
      DEFAULT_IDLE_AFTER_MS,
      DEFAULT_MAX_REMOTE_CLIENTS,
    ]).toEqual([50, 10_000, 70_000, 15_000, 64]);
  });
});

describe("interpolation docs", () => {
  // Copied from apps/docs/content/docs/core/interpolation.mdx (The Interpolator interface).
  interface DocInterpolator {
    target(x: number, y: number, timestampMs: number): void;
    shift(dx: number, dy: number): void;
    sample(timestampMs: number): { x: number; y: number; settled: boolean };
    sampleInto?(out: { x: number; y: number; settled: boolean }, timestampMs: number): void;
    reset?(): void;
  }

  type DocInterpolatorFactory = () => DocInterpolator;

  it("matches the exported types", () => {
    expectTypeOf<DocInterpolator>().toEqualTypeOf<Interpolator>();
    expectTypeOf<DocInterpolatorFactory>().toEqualTypeOf<InterpolatorFactory>();
  });

  it("eases linearly, snaps on the first target, and samples into a box", () => {
    // Copied from apps/docs/content/docs/core/interpolation.mdx (linearInterpolator).
    const interpolator = linearInterpolator(80);
    const factory = () => linearInterpolator(120);

    interpolator.target(10, 10, 0);
    expect(interpolator.sample(0)).toEqual({ x: 10, y: 10, settled: true });
    interpolator.target(90, 10, 0);
    const box = { x: 0, y: 0, settled: true };
    interpolator.sampleInto?.(box, 40);
    expect(box).toEqual({ x: 50, y: 10, settled: false });
    expectTypeOf(factory).toMatchTypeOf<InterpolatorFactory>();
    expectTypeOf(linearInterpolator).toMatchTypeOf<InterpolatorFactory>();
  });

  it("noneInterpolator returns the last target, always settled", () => {
    const interpolator = noneInterpolator();
    interpolator.target(5, 6, 0);
    expect(interpolator.sample(0)).toEqual({ x: 5, y: 6, settled: true });
  });
});

describe("codec docs", () => {
  // Copied from apps/docs/content/docs/core/codecs.mdx (CursorCodec).
  interface DocCursorCodec {
    encode(message: CursorPresence): Uint8Array;
    decode(data: Uint8Array): unknown;
  }

  it("matches the exported CursorCodec", () => {
    expectTypeOf<DocCursorCodec>().toEqualTypeOf<CursorCodec>();
  });

  it("the jsonCodec listing behaves like jsonCodec", () => {
    // Copied from apps/docs/content/docs/core/codecs.mdx (jsonCodec).
    const docJsonCodec: CursorCodec = {
      encode(message) {
        return new TextEncoder().encode(JSON.stringify(message));
      },
      decode(data) {
        try {
          return JSON.parse(new TextDecoder().decode(data));
        } catch {
          return null;
        }
      },
    };

    expect(docJsonCodec.encode(presenceMessage)).toEqual(jsonCodec.encode(presenceMessage));
    expect(docJsonCodec.decode(new Uint8Array([0xff]))).toBe(jsonCodec.decode(new Uint8Array([0xff])));
  });

  it("passes a codec to the client", () => {
    const { a: myTransport } = createInMemoryPair();
    const myCodec = binaryCodec;

    // Copied from apps/docs/content/docs/core/codecs.mdx (CursorCodec).
    const client = createPresenceClient({ transport: myTransport, codec: myCodec });

    // Copied from apps/docs/content/docs/core/binary-codec.mdx.
    const binaryClient = createPresenceClient({ transport: myTransport, codec: binaryCodec });

    expect(binaryClient.getStatus()).toBe(client.getStatus());
    client.dispose();
    binaryClient.dispose();
  });

  it("binary layout: an event frame writes pointer and context tags as 0 and the data in the user slot", () => {
    const bytes = binaryCodec.encode({ ...presenceMessage, cursor: null, event: { type: "ok", data: 1 } });
    const afterSequence = 3 + 2 + 4 + 2 + 2 + 4;
    expect(Array.from(bytes.slice(afterSequence, afterSequence + 3))).toEqual([3, 2, 0]);
    const afterType = afterSequence + 3 + 2;
    expect(Array.from(bytes.slice(afterType, afterType + 3))).toEqual([0, 0, 2]);
    const mouse = binaryCodec.encode({ ...presenceMessage, cursor: null, pointer: { type: "mouse" } });
    expect(mouse[afterSequence + 1]).toBe(2);
    expect(() =>
      binaryCodec.encode({ ...presenceMessage, cursor: null, event: { type: "x".repeat(256) } }),
    ).toThrow(Error);
  });
});

describe("custom transport docs: BroadcastChannel sketch", () => {
  it("tracks its status through connect and disconnect", () => {
    // Copied from apps/docs/content/docs/core/custom-transport.mdx (BroadcastChannel sketch).
    function createBroadcastChannelTransport(channelName: string): LiveCursorTransport {
      const listeners = new Set<(data: Uint8Array) => void>();
      const statusListeners = new Set<(status: ConnectionStatus) => void>();
      let channel: BroadcastChannel | null = null;
      let status: ConnectionStatus = "disconnected";

      function setStatus(next: ConnectionStatus) {
        status = next;
        for (const listener of statusListeners) listener(next);
      }

      return {
        connect() {
          if (channel !== null) return;
          channel = new BroadcastChannel(channelName);
          channel.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (!ArrayBuffer.isView(event.data)) return;
            const { buffer, byteOffset, byteLength } = event.data;
            const bytes = new Uint8Array(buffer, byteOffset, byteLength);
            for (const listener of listeners) listener(bytes);
          });
          // a BroadcastChannel has no handshake, so it is connected at once
          setStatus("connected");
        },
        disconnect() {
          channel?.close();
          channel = null;
          setStatus("disconnected");
        },
        send(data) {
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel takes no origin
          channel?.postMessage(data);
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        subscribeStatus(listener) {
          listener(status);
          statusListeners.add(listener);
          return () => statusListeners.delete(listener);
        },
        getStatus() {
          return status;
        },
      };
    }

    const transport = createBroadcastChannelTransport("docs-sample");
    const statuses: ConnectionStatus[] = [];
    transport.subscribeStatus?.((status) => statuses.push(status));
    void transport.connect?.();
    void transport.disconnect?.();
    expect(statuses).toEqual(["disconnected", "connected", "disconnected"]);
    expect(transport.getStatus?.()).toBe("disconnected");
  });
});

describe("in-memory transport docs", () => {
  it("wires a to b", () => {
    // Copied from apps/docs/content/docs/core/in-memory-transport.mdx (Usage).
    const { a, b } = createInMemoryPair();
    const clientA = createPresenceClient({ transport: a, user: { name: "Alice" } });
    const clientB = createPresenceClient({ transport: b, user: { name: "Bob" } });

    clientA.setLocalCursor(cursor);
    vi.advanceTimersByTime(50);
    expect(clientB.getRemotePresence()[0]?.user).toEqual({ name: "Alice" });
    clientA.dispose();
    clientB.dispose();
  });
});

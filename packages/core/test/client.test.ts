import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { jsonCodec } from "../src/codec";
import type { LiveCursorTransport } from "../src/transport";
import type { ConnectionStatus } from "../src/protocol";

function makeTransport(withStatus = false, initialStatus?: ConnectionStatus) {
  const sent: Uint8Array[] = [];
  const messageListeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const transport: LiveCursorTransport = {
    send: vi.fn((data: Uint8Array) => {
      sent.push(data);
    }),
    subscribe: vi.fn((listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    }),
  };

  if (withStatus) {
    transport.subscribeStatus = vi.fn((listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    });
  }

  if (initialStatus !== undefined) {
    transport.getStatus = vi.fn(() => initialStatus);
  }

  return {
    transport,
    sent,
    emit: (data: Uint8Array) => messageListeners.forEach((l) => l(data)),
    setStatus: (status: ConnectionStatus) => statusListeners.forEach((l) => l(status)),
    messageListenerCount: () => messageListeners.size,
    statusListenerCount: () => statusListeners.size,
  };
}

function decodeSent(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

let idCounter = 0;
function idFactory() {
  idCounter += 1;
  return `id-${idCounter}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  idCounter = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPresenceClient publishing", () => {
  it("rate-limits publishing: many updates within one interval produce one send with the latest state", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.3, v: 0.3 }] });

    vi.advanceTimersByTime(50);

    expect(sent).toHaveLength(1);
    const message = decodeSent(sent[0]!);
    expect(message.cursor.anchors[0].u).toBe(0.3);

    client.dispose();
  });

  it("never queues stale positions across multiple intervals", () => {
    const { sent, transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    // no update happened; heartbeat is separate, so no publish fires here
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.dispose();
  });

  it("does not send while status is disconnected or connecting", () => {
    const { transport, sent, setStatus } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    expect(client.getStatus()).toBe("connecting");
    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(0);

    setStatus("disconnected");
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(0);

    setStatus("connected");
    client.updateLocalCursor({ anchors: [{ id: "b", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.dispose();
  });

  it("F4: republishes the latest local state on reconnect, respecting the rate limiter, without waiting for a new pointer move", () => {
    const { transport, sent, setStatus } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    // connecting: cursor updates are recorded locally but never sent
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(0);

    setStatus("connected");
    // the connect transition immediately schedules a publish (still rate-limited, not synchronous)
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    expect(decodeSent(sent[0]!).cursor.anchors[0].u).toBe(0.1);

    // disconnect again without any further local update
    setStatus("disconnected");
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(1); // still nothing new to send while disconnected

    // move the cursor while disconnected — must not be recorded as "sent" since send() never actually ran
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.9, v: 0.9 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    // reconnect: the latest position must republish without a new pointer move or waiting for the heartbeat
    setStatus("connected");
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(2);
    expect(decodeSent(sent[1]!).cursor.anchors[0].u).toBe(0.9);

    client.dispose();
  });

  it("reports a constant connected status when the transport has no subscribeStatus", () => {
    const { transport } = makeTransport(false);
    const client = createPresenceClient({ transport, idFactory });
    expect(client.getStatus()).toBe("connected");
    client.dispose();
  });

  it("swallows send errors", () => {
    const transport: LiveCursorTransport = {
      send: vi.fn(() => {
        throw new Error("boom");
      }),
      subscribe: vi.fn(() => () => {}),
    };
    const client = createPresenceClient({ transport, idFactory });
    expect(() => {
      client.updateLocalCursor({ anchors: [] });
      vi.advanceTimersByTime(50);
    }).not.toThrow();
    client.dispose();
  });
});

describe("createPresenceClient heartbeat", () => {
  it("resends the last state on every heartbeatMs", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50, heartbeatMs: 1000 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50); // publish fires
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1000); // heartbeat fires
    expect(sent).toHaveLength(2);
    const message = decodeSent(sent[1]!);
    expect(message.cursor.anchors[0].u).toBe(0.5);

    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(3);

    client.dispose();
  });
});

describe("createPresenceClient inbound pipeline", () => {
  it("decodes, validates, and stores inbound presence messages", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });

    const remoteMessage = {
      version: 1,
      clientId: "remote-1",
      session: "remote-session",
      sequence: 0,
      cursor: { anchors: [{ id: "nav", u: 0.5, v: 0.5 }] },
    };
    emit(jsonCodec.encode(remoteMessage as never));

    expect(client.getRemoteSnapshot()).toHaveLength(1);
    expect(client.getRemoteSnapshot()[0]?.clientId).toBe("remote-1");

    client.dispose();
  });

  it("drops invalid inbound bytes without throwing", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    expect(() => emit(new Uint8Array([0xff, 0xfe]))).not.toThrow();
    expect(client.getRemoteSnapshot()).toHaveLength(0);
    client.dispose();
  });

  it("F5: drops an inbound message over 32 KiB of wire bytes before it ever reaches codec.decode", () => {
    const { transport, emit } = makeTransport();
    const decodeSpy = vi.spyOn(jsonCodec, "decode");
    const client = createPresenceClient({ transport, idFactory, codec: jsonCodec });

    const oversized = new Uint8Array(32 * 1024 + 1);
    expect(() => emit(oversized)).not.toThrow();

    expect(decodeSpy).not.toHaveBeenCalled();
    expect(client.getRemoteSnapshot()).toHaveLength(0);

    decodeSpy.mockClear();
    const withinLimit = jsonCodec.encode({
      version: 1,
      clientId: "remote-1",
      session: "s",
      sequence: 0,
      cursor: null,
    });
    emit(withinLimit);
    expect(decodeSpy).toHaveBeenCalledTimes(1);

    decodeSpy.mockRestore();
    client.dispose();
  });

  it("K7: drops a spoofed huge-sequence message so later genuine messages still land", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });

    emit(
      jsonCodec.encode({
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1e21,
        cursor: { anchors: [] },
      } as never),
    );
    expect(client.getRemoteSnapshot()).toHaveLength(0);

    emit(
      jsonCodec.encode({
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      } as never),
    );
    expect(client.getRemoteSnapshot()).toHaveLength(1);
    expect(client.getRemoteSnapshot()[0]?.sequence).toBe(1);

    client.dispose();
  });

  it("ignores echoes of its own clientId", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, clientId: "self", idFactory });
    emit(
      jsonCodec.encode({
        version: 1,
        clientId: "self",
        session: "other-session",
        sequence: 0,
        cursor: null,
      } as never),
    );
    expect(client.getRemoteSnapshot()).toHaveLength(0);
    client.dispose();
  });
});

describe("createPresenceClient dispose", () => {
  it("stops timers and unsubscribes from the transport", () => {
    const { transport, sent, messageListenerCount } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50, heartbeatMs: 200 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    expect(messageListenerCount()).toBe(1);

    client.dispose();
    expect(messageListenerCount()).toBe(0);

    const sentBeforeAdvance = sent.length;
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(sentBeforeAdvance);
  });

  it("runs registered teardown callbacks on dispose", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    const teardown = vi.fn();
    client.registerTeardown(teardown);
    client.dispose();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("is idempotent", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    expect(() => {
      client.dispose();
      client.dispose();
    }).not.toThrow();
  });

  it("ignores updateLocalCursor after dispose", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    client.dispose();
    expect(sent).toHaveLength(1); // only the leave message
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
  });
});

describe("createPresenceClient session/context/user", () => {
  it("generates clientId and session via the injected idFactory", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    expect(client.clientId).toBe("id-1");
    expect(client.session).toBe("id-2");
    client.dispose();
  });

  it("exposes context and user through getContext/getUser", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      context: { route: "/" },
      user: { name: "Ada" },
    });
    expect(client.getContext()).toEqual({ route: "/" });
    expect(client.getUser()).toEqual({ name: "Ada" });
    client.setContext({ route: "/settings" });
    client.setUser(undefined);
    expect(client.getContext()).toEqual({ route: "/settings" });
    expect(client.getUser()).toBeUndefined();
    client.dispose();
  });

  it("setContext and setUser affect subsequent sends", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    client.setContext({ route: "/settings" });
    client.setUser({ name: "Ada" });
    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    const message = decodeSent(sent[0]!);
    expect(message.context).toEqual({ route: "/settings" });
    expect(message.user).toEqual({ name: "Ada" });
    client.dispose();
  });

  it("sends initial context and user on the first delta publish", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      publishIntervalMs: 50,
      context: { route: "/" },
      user: { name: "Ada" },
    });

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    const message = decodeSent(sent[0]!);
    expect(message.context).toEqual({ route: "/" });
    expect(message.user).toEqual({ name: "Ada" });

    client.dispose();
  });

  it("sends explicit null context and user in a full publish while no value is set", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      publishIntervalMs: 50,
      heartbeatMs: 1000,
    });

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[0]!).context).toBeUndefined();

    vi.advanceTimersByTime(1000);
    const heartbeat = decodeSent(sent[1]!);
    expect(heartbeat.context).toBeNull();
    expect(heartbeat.user).toBeNull();

    client.dispose();
  });

  it("omits unchanged context and user from later delta publishes", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.setContext({ route: "/a" });
    client.setUser({ name: "Ada" });
    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[0]!).context).toEqual({ route: "/a" });
    expect(decodeSent(sent[0]!).user).toEqual({ name: "Ada" });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    vi.advanceTimersByTime(50);
    const delta = decodeSent(sent[1]!);
    expect(delta.cursor.anchors[0].u).toBe(0.2);
    expect(delta.context).toBeUndefined();
    expect(delta.user).toBeUndefined();

    client.dispose();
  });

  it("sends an explicit null context/user delta when the value is cleared", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.setContext({ route: "/a" });
    client.setUser({ name: "Ada" });
    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);

    client.setContext(undefined);
    client.setUser(undefined);
    vi.advanceTimersByTime(50);
    const cleared = decodeSent(sent[1]!);
    expect(cleared.context).toBeNull();
    expect(cleared.user).toBeNull();

    client.dispose();
  });

  it("does not republish a context/user value that is reference-equal to the current value", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    const context = { route: "/a" };

    client.setContext(context);
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.setContext(context);
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.dispose();
  });

  it("includes the current context and user in the reconnect and heartbeat full publishes", () => {
    const { transport, sent, setStatus } = makeTransport(true, "connected");
    const client = createPresenceClient({
      transport,
      idFactory,
      publishIntervalMs: 50,
      heartbeatMs: 1000,
    });

    client.setContext({ route: "/a" });
    client.setUser({ name: "Ada" });
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[0]!).context).toEqual({ route: "/a" });

    vi.advanceTimersByTime(1000);
    expect(decodeSent(sent[1]!).context).toEqual({ route: "/a" });
    expect(decodeSent(sent[1]!).user).toEqual({ name: "Ada" });

    setStatus("disconnected");
    setStatus("connected");
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[2]!).context).toEqual({ route: "/a" });
    expect(decodeSent(sent[2]!).user).toEqual({ name: "Ada" });

    client.dispose();
  });
});

describe("createPresenceClient adaptive publish rate", () => {
  it("uses the slow interval while the transport reports buffered bytes above the high watermark", () => {
    const sent: Uint8Array[] = [];
    let buffered = 0;
    const transport: LiveCursorTransport = {
      send: vi.fn((data: Uint8Array) => {
        sent.push(data);
        buffered += 100;
      }),
      subscribe: vi.fn(() => () => {}),
      bufferedBytes: () => buffered,
    };
    const client = createPresenceClient({
      transport,
      idFactory,
      publishIntervalMs: 50,
      adaptivePublish: { highWatermarkBytes: 100, lowWatermarkBytes: 0, slowPublishIntervalMs: 200 },
    });

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(150);
    expect(sent).toHaveLength(2);

    client.dispose();
  });

  it("returns to the normal interval after the buffered bytes fall to the low watermark", () => {
    const sent: Uint8Array[] = [];
    const bufferedByCall = [200, 0, 0];
    let calls = 0;
    let buffered = 0;
    const transport: LiveCursorTransport = {
      send: vi.fn((data: Uint8Array) => {
        sent.push(data);
        buffered = bufferedByCall[calls] ?? 0;
        calls += 1;
      }),
      subscribe: vi.fn(() => () => {}),
      bufferedBytes: () => buffered,
    };
    const client = createPresenceClient({
      transport,
      idFactory,
      publishIntervalMs: 50,
      adaptivePublish: { highWatermarkBytes: 100, lowWatermarkBytes: 0, slowPublishIntervalMs: 200 },
    });

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(2);

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(3);

    client.dispose();
  });
});

describe("createPresenceClient dirty-flag publishing", () => {
  it("publishes after setContext without a cursor move", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    client.setContext({ route: "/a" });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    const message = decodeSent(sent[0]!);
    expect(message.context).toEqual({ route: "/a" });
    expect(message.cursor).toBeNull();
    client.dispose();
  });

  it("publishes after setUser without a cursor move", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    client.setUser({ name: "Ada" });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    expect(decodeSent(sent[0]!).user).toEqual({ name: "Ada" });
    client.dispose();
  });

  it("does not send while status is reconnecting", () => {
    const { transport, sent, setStatus } = makeTransport(true, "connected");
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    setStatus("reconnecting");
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(0);
    client.dispose();
  });

  it("republishes the latest state on reconnecting to connected, even without a local change", () => {
    const { transport, sent, setStatus } = makeTransport(true, "connected");
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.4, v: 0.4 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    setStatus("reconnecting");
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.6, v: 0.6 }] });
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(1);

    setStatus("connected");
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(2);
    expect(decodeSent(sent[1]!).cursor.anchors[0].u).toBe(0.6);

    // every transition into "connected" republishes, even with nothing new locally
    setStatus("reconnecting");
    setStatus("connected");
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(3);
    expect(decodeSent(sent[2]!).cursor.anchors[0].u).toBe(0.6);

    client.dispose();
  });

  it("re-arms the publish timer when a send fails while connected", () => {
    const sent: Uint8Array[] = [];
    let failures = 1;
    const transport: LiveCursorTransport = {
      send: vi.fn((data: Uint8Array) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error("boom");
        }
        sent.push(data);
      }),
      subscribe: vi.fn(() => () => {}),
    };
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(0);

    // retry fires without a new local change
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    expect(decodeSent(sent[0]!).cursor.anchors[0].u).toBe(0.5);

    client.dispose();
  });
});

describe("createPresenceClient pointer type", () => {
  it("includes the pointer type on the wire and keeps it across single-arg updates", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [] }, { type: "touch" });
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[0]!).pointer).toEqual({ type: "touch" });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    vi.advanceTimersByTime(50);
    expect(decodeSent(sent[1]!).pointer).toEqual({ type: "touch" });

    client.dispose();
  });
});

describe("createPresenceClient initial status via transport.getStatus", () => {
  it("adopts the transport's current status at creation", () => {
    const { transport, sent } = makeTransport(true, "connected");
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    expect(client.getStatus()).toBe("connected");

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    client.dispose();
  });

  it("falls back to connecting when subscribeStatus exists without getStatus", () => {
    const { transport } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory });
    expect(client.getStatus()).toBe("connecting");
    client.dispose();
  });
});

describe("createPresenceClient dispose lifecycle", () => {
  it("sends a best-effort cursor:null leave message on dispose", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);

    client.dispose();
    expect(sent).toHaveLength(2);
    expect(decodeSent(sent[1]!).cursor).toBeNull();
  });

  it("sends no leave message while unsendable", () => {
    const { transport, sent } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory });
    expect(client.getStatus()).toBe("connecting");
    client.dispose();
    expect(sent).toHaveLength(0);
  });

  it("notifies status listeners with disconnected before clearing them", () => {
    const { transport, setStatus } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory });
    setStatus("connected");

    const seen: ConnectionStatus[] = [];
    client.subscribeStatus((status) => seen.push(status));
    client.dispose();

    expect(seen).toEqual(["disconnected"]);
    expect(client.getStatus()).toBe("disconnected");
  });

  it("registerTeardown returns an unregister function", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    const teardown = vi.fn();
    const unregister = client.registerTeardown(teardown);
    unregister();
    client.dispose();
    expect(teardown).not.toHaveBeenCalled();
  });

  it("runs the teardown immediately when registered after dispose", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    client.dispose();

    const late = vi.fn();
    const unregister = client.registerTeardown(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(() => unregister()).not.toThrow();
  });
});

describe("createPresenceClient guarded fan-out", () => {
  it("a throwing status listener does not break others or the reconnect republish", () => {
    const { transport, sent, setStatus } = makeTransport(true);
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    const seen: ConnectionStatus[] = [];
    client.subscribeStatus(() => {
      throw new Error("boom");
    });
    client.subscribeStatus((status) => seen.push(status));

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    expect(() => setStatus("connected")).not.toThrow();
    expect(seen).toEqual(["connected"]);

    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(1);
    client.dispose();
  });

  it("a throwing remote-store listener does not break other listeners or the transport loop", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });

    const calls: number[] = [];
    client.subscribeRemote(() => {
      throw new Error("boom");
    });
    client.subscribeRemote(() => calls.push(1));

    const remoteMessage = {
      version: 1,
      clientId: "remote-1",
      session: "remote-session",
      sequence: 0,
      cursor: null,
    };
    expect(() => emit(jsonCodec.encode(remoteMessage as never))).not.toThrow();
    expect(calls).toHaveLength(1);
    expect(client.getRemoteSnapshot()).toHaveLength(1);
    client.dispose();
  });
});

describe("createPresenceClient option clamping", () => {
  it("clamps heartbeatMs to at least 1 ms", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, heartbeatMs: 0 });
    vi.advanceTimersByTime(5);
    expect(sent).toHaveLength(5);
    client.dispose();
  });

  it("clamps staleTimeoutMs to at least 1000 ms", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, staleTimeoutMs: 0 });

    emit(
      jsonCodec.encode({
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 0,
        cursor: null,
      } as never),
    );
    expect(client.getRemoteSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(600); // first sweep ran; entry is younger than the clamped timeout
    expect(client.getRemoteSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(1000); // now past the clamped timeout
    expect(client.getRemoteSnapshot()).toHaveLength(0);
    client.dispose();
  });
});

describe("createPresenceClient dev-mode size warnings", () => {
  it("warns once when context exceeds maxFieldBytes, not per message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.setContext({ blob: "x".repeat(9000) });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockClear();
    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50);
    expect(warnSpy).not.toHaveBeenCalled();

    client.dispose();
    warnSpy.mockRestore();
  });

  it("warns when the encoded message exceeds maxMessageBytes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      validationLimits: { maxFieldBytes: 64 * 1024 },
    });

    client.setContext({ blob: "x".repeat(40_000) });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("maxMessageBytes");

    client.dispose();
    warnSpy.mockRestore();
  });
});

describe("createPresenceClient dev-mode remote-cap warning", () => {
  it("warns once when a new remote client is dropped at maxRemoteClients", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      maxRemoteClients: 1,
      publishIntervalMs: 50,
    });

    const remoteMessage = (clientId: string) =>
      emit(jsonCodec.encode({ version: 1, clientId, session: `${clientId}-session`, sequence: 0, cursor: { anchors: [] } } as never));

    remoteMessage("remote-1");
    expect(warnSpy).not.toHaveBeenCalled();

    remoteMessage("remote-2");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("maxRemoteClients=1");

    remoteMessage("remote-3");
    expect(warnSpy).toHaveBeenCalledTimes(1);

    client.dispose();
    warnSpy.mockRestore();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { jsonCodec } from "../src/codec";
import type { LiveCursorTransport } from "../src/transport";
import type { ConnectionStatus } from "../src/protocol";

function makeTransport(withStatus = false, initialStatus?: ConnectionStatus) {
  const sent: Uint8Array[] = [];
  const messageListeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const disconnect = vi.fn();

  const transport: LiveCursorTransport = {
    send: vi.fn((data: Uint8Array) => {
      sent.push(data);
    }),
    subscribe: vi.fn((listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    }),
    disconnect,
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
    disconnect,
    emit: (data: Uint8Array) => messageListeners.forEach((l) => l(data)),
    setStatus: (status: ConnectionStatus) => statusListeners.forEach((l) => l(status)),
    messageListenerCount: () => messageListeners.size,
    statusListenerCount: () => statusListeners.size,
  };
}

function decodeSent(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

function makeBufferedTransport(sent: Uint8Array[], bufferedByCall: number[]): LiveCursorTransport {
  let calls = 0;
  let buffered = 0;
  return {
    send: vi.fn((data: Uint8Array) => {
      sent.push(data);
      buffered = bufferedByCall[calls] ?? 0;
      calls += 1;
    }),
    subscribe: vi.fn(() => () => {}),
    bufferedBytes: () => buffered,
  };
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
  it("dispose sends a leave message", () => {
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    client.dispose();
    expect(decodeSent(sent.at(-1)!)).toMatchObject({ cursor: null, leave: true });
  });

  it("drops a remote user that parseUser rejects and keeps one it accepts", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<unknown, { name: string }>({
      transport,
      idFactory,
      parseUser: (value) =>
        typeof (value as { name?: unknown }).name === "string" ? (value as { name: string }) : undefined,
    });
    const send = (clientId: string, user: unknown) =>
      emit(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, clientId, session: "s", sequence: 0, cursor: null, user }),
        ),
      );
    send("bad", { name: {} });
    send("good", { name: "Ada" });
    const users = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.user]));
    expect(users).toEqual({ bad: undefined, good: { name: "Ada" } });
    client.dispose();
  });

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

describe("createPresenceClient context subscription", () => {
  it("notifies subscribers after setContext updates the value", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    const calls: Array<{ value: unknown }> = [];
    const unsubscribe = client.subscribeContext(() => {
      calls.push({ value: client.getContext() });
    });

    client.setContext({ route: "/a" });
    client.setContext({ route: "/b" });
    client.setContext(undefined);

    expect(calls.map((c) => c.value)).toEqual([{ route: "/a" }, { route: "/b" }, undefined]);
    unsubscribe();
    client.dispose();
  });

  it("does not notify subscribers for the initial context or for changes made before subscribing", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, context: { route: "/" } });

    client.setContext({ route: "/before" });
    let calls = 0;
    const unsubscribe = client.subscribeContext(() => {
      calls += 1;
    });
    expect(calls).toBe(0);

    client.setContext({ route: "/after" });
    expect(calls).toBe(1);
    unsubscribe();
    client.dispose();
  });

  it("stops notifying after unsubscribe", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    let calls = 0;
    const unsubscribe = client.subscribeContext(() => {
      calls += 1;
    });

    client.setContext({ route: "/a" });
    expect(calls).toBe(1);

    unsubscribe();
    client.setContext({ route: "/b" });
    expect(calls).toBe(1);

    client.dispose();
  });

  it("does not notify when the value is reference-equal to the current value", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    const context = { route: "/a" };
    let calls = 0;
    const unsubscribe = client.subscribeContext(() => {
      calls += 1;
    });

    client.setContext(context);
    expect(calls).toBe(1);

    client.setContext(context);
    expect(calls).toBe(1);

    unsubscribe();
    client.dispose();
  });

  it("a throwing context listener does not break other listeners", () => {
    const { transport } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    let healthyCalls = 0;
    const unsubscribeHealthy = client.subscribeContext(() => {
      healthyCalls += 1;
    });
    const unsubscribeThrowing = client.subscribeContext(() => {
      throw new Error("boom");
    });

    expect(() => client.setContext({ route: "/a" })).not.toThrow();
    expect(healthyCalls).toBe(1);

    unsubscribeHealthy();
    unsubscribeThrowing();
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
    const transport = makeBufferedTransport(sent, [200, 0, 0]);
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
    const send = vi.fn((data: Uint8Array) => {
      sent.push(data);
    });
    send.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const transport: LiveCursorTransport = {
      send,
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

describe("createPresenceClient publish retry backoff", () => {
  function makeThrowingTransport() {
    let failing = true;
    const send = vi.fn(() => {
      if (failing) throw new Error("boom");
    });
    const transport: LiveCursorTransport = { send, subscribe: vi.fn(() => () => {}) };
    return {
      transport,
      send,
      setFailing: (value: boolean) => {
        failing = value;
      },
    };
  }

  it("backs off exponentially while sends keep failing, capped at 2 s", () => {
    const { transport, send } = makeThrowingTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [] });

    vi.advanceTimersByTime(50); // t=50: initial attempt fails, retry in 50 ms
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50); // t=100
    expect(send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100); // t=200
    expect(send).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(200); // t=400
    expect(send).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(400); // t=800
    expect(send).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(800); // t=1600
    expect(send).toHaveBeenCalledTimes(6);
    vi.advanceTimersByTime(1600); // t=3200: backoff capped at 2 s
    expect(send).toHaveBeenCalledTimes(7);
    vi.advanceTimersByTime(2000); // t=5200
    expect(send).toHaveBeenCalledTimes(8);
    vi.advanceTimersByTime(2000); // t=7200
    expect(send).toHaveBeenCalledTimes(9);

    client.dispose();
  });

  it("resets the backoff after a successful send", () => {
    const { transport, send, setFailing } = makeThrowingTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [] });
    vi.advanceTimersByTime(50); // t=50: fails, schedules retry in 50 ms
    expect(send).toHaveBeenCalledTimes(1);

    setFailing(false);
    vi.advanceTimersByTime(50); // t=100: succeeds, backoff reset
    expect(send).toHaveBeenCalledTimes(2);

    // a new failing publish must start the backoff at 50 ms again, not the grown delay
    setFailing(true);
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50); // t=150: fails, schedules retry in 50 ms
    expect(send).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(49); // t=199: no retry yet
    expect(send).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1); // t=200: retry fires
    expect(send).toHaveBeenCalledTimes(4);

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

  it("calls transport.disconnect once on dispose and not again on a second dispose", () => {
    const { transport, disconnect } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });

    client.dispose();
    client.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
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

describe("createPresenceClient autoConnect", () => {
  it("calls transport.connect() exactly once, after subscribe and subscribeStatus, when autoConnect is true", () => {
    const calls: string[] = [];
    const connect = vi.fn(() => {
      calls.push("connect");
    });
    const transport: LiveCursorTransport = {
      connect,
      disconnect: vi.fn(),
      send: vi.fn(),
      subscribe: vi.fn((_listener) => {
        calls.push("subscribe");
        return () => {};
      }),
      subscribeStatus: vi.fn((listener) => {
        calls.push("subscribeStatus");
        listener("connecting");
        return () => {};
      }),
    };

    const client = createPresenceClient({ transport, idFactory, autoConnect: true });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["subscribe", "subscribeStatus", "connect"]);
    client.dispose();
  });

  it("calls transport.connect() when omitted, and never when autoConnect is false", () => {
    const { transport: transportDefault } = makeTransport();
    const connectDefault = vi.fn();
    transportDefault.connect = connectDefault;
    const clientDefault = createPresenceClient({ transport: transportDefault, idFactory });
    expect(connectDefault).toHaveBeenCalledTimes(1);
    clientDefault.dispose();

    const { transport: transportFalse } = makeTransport();
    const connectFalse = vi.fn();
    transportFalse.connect = connectFalse;
    const clientFalse = createPresenceClient({
      transport: transportFalse,
      idFactory,
      autoConnect: false,
    });
    expect(connectFalse).not.toHaveBeenCalled();
    clientFalse.dispose();
  });

  it("works with autoConnect true against a transport with no connect method", () => {
    const { transport } = makeTransport();
    expect(() => createPresenceClient({ transport, idFactory, autoConnect: true })).not.toThrow();
  });

  it("does not let a throwing connect() escape client creation", () => {
    const { transport } = makeTransport();
    transport.connect = vi.fn(() => {
      throw new Error("boom");
    });

    expect(() => createPresenceClient({ transport, idFactory, autoConnect: true })).not.toThrow();
  });

  it("does not produce an unhandled rejection when connect() rejects", async () => {
    const { transport } = makeTransport();
    transport.connect = vi.fn(() => Promise.reject(new Error("boom")));

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const client = createPresenceClient({ transport, idFactory, autoConnect: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
      client.dispose();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("calls transport.disconnect() on dispose with autoConnect true, same as the default", () => {
    const { transport, disconnect } = makeTransport();
    transport.connect = vi.fn();
    const client = createPresenceClient({ transport, idFactory, autoConnect: true });

    client.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
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
      emit(
        jsonCodec.encode({
          version: 1,
          clientId,
          session: `${clientId}-session`,
          sequence: 0,
          cursor: { anchors: [] },
        } as never),
      );

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

describe("createPresenceClient onRemoteClientDrop", () => {
  function emitRemote(emit: (data: Uint8Array) => void, clientId: string) {
    emit(
      jsonCodec.encode({
        version: 1,
        clientId,
        session: `${clientId}-session`,
        sequence: 0,
        cursor: { anchors: [] },
      } as never),
    );
  }

  it("invokes onRemoteClientDrop whenever a new remote client is dropped at the cap", () => {
    const onRemoteClientDrop = vi.fn();
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      maxRemoteClients: 1,
      onRemoteClientDrop,
    });

    emitRemote(emit, "remote-1");
    expect(onRemoteClientDrop).not.toHaveBeenCalled();

    emitRemote(emit, "remote-2");
    expect(onRemoteClientDrop).toHaveBeenCalledTimes(1);

    emitRemote(emit, "remote-3");
    expect(onRemoteClientDrop).toHaveBeenCalledTimes(2);

    client.dispose();
  });

  it("keeps ingesting existing clients when the drop callback throws", () => {
    const onRemoteClientDrop = vi.fn(() => {
      throw new Error("boom");
    });
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({
      transport,
      idFactory,
      maxRemoteClients: 1,
      onRemoteClientDrop,
    });

    expect(() => {
      emitRemote(emit, "remote-1");
      emitRemote(emit, "remote-2");
    }).not.toThrow();

    expect(client.getRemoteSnapshot()).toHaveLength(1);
    expect(client.getRemoteSnapshot()[0]?.clientId).toBe("remote-1");

    client.dispose();
  });
});

describe("createPresenceClient visibilitychange publish flush", () => {
  type VisibilityListener = () => void;

  function installDocumentStub() {
    const listeners = new Set<VisibilityListener>();
    const documentStub = {
      visibilityState: "hidden" as string,
      addEventListener: vi.fn((type: string, listener: VisibilityListener) => {
        if (type === "visibilitychange") listeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: VisibilityListener) => {
        if (type === "visibilitychange") listeners.delete(listener);
      }),
    };
    Object.defineProperty(globalThis, "document", { value: documentStub, configurable: true });
    return {
      documentStub,
      listeners,
      fire: () => {
        for (const listener of listeners) listener();
      },
    };
  }

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("flushes a pending publish immediately when the page becomes visible", () => {
    const { documentStub, fire, listeners } = installDocumentStub();
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    expect(sent).toHaveLength(0); // rate-limited: the 50 ms timer has not fired yet
    expect(listeners).toHaveLength(1);

    documentStub.visibilityState = "visible";
    fire();

    expect(sent).toHaveLength(1);
    expect(decodeSent(sent[0]!).cursor.anchors[0].u).toBe(0.5);

    vi.advanceTimersByTime(100); // the rate-limited timer must not double-send
    expect(sent).toHaveLength(1);

    client.dispose();
  });

  it("does not flush while the page is still hidden", () => {
    const { documentStub, fire } = installDocumentStub();
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });

    client.updateLocalCursor({ anchors: [] });
    documentStub.visibilityState = "hidden";
    fire();
    expect(sent).toHaveLength(0);

    vi.advanceTimersByTime(50); // the normal rate-limited path still works
    expect(sent).toHaveLength(1);

    client.dispose();
  });

  it("removes the visibilitychange listener on dispose", () => {
    const { documentStub, fire, listeners } = installDocumentStub();
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, publishIntervalMs: 50 });
    expect(listeners).toHaveLength(1);

    client.dispose();
    expect(listeners).toHaveLength(0);
    expect(documentStub.removeEventListener).toHaveBeenCalledTimes(1);

    client.updateLocalCursor({ anchors: [] });
    fire();
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(1); // only the leave message
  });
});

describe("close reasons", () => {
  it("forwards the transport close reason and tolerates a transport without it", () => {
    const { transport } = makeTransport();
    const received: unknown[] = [];
    let emit: (close: { code?: number; willReconnect: boolean }) => void = () => {};
    transport.subscribeClose = (listener) => {
      emit = listener;
      return () => {};
    };
    const client = createPresenceClient({ transport, idFactory });
    client.subscribeClose((close) => received.push(close));
    emit({ code: 4004, willReconnect: false });
    expect(received).toEqual([{ code: 4004, willReconnect: false }]);
    client.dispose();

    const plain = makeTransport().transport;
    const other = createPresenceClient({ transport: plain, idFactory });
    expect(() => other.subscribeClose(() => {})()).not.toThrow();
    other.dispose();
  });
});

describe("leave", () => {
  it("sends a leave message once, and the next publish carries the full state again", () => {
    vi.useFakeTimers();
    const { transport, sent } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, user: { name: "Ada" }, heartbeatMs: 60_000 });
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(100);

    client.leave();
    client.leave();
    expect(sent.map((bytes) => decodeSent(bytes).leave)).toEqual([undefined, true]);

    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.2, v: 0.2 }] });
    vi.advanceTimersByTime(100);
    expect(decodeSent(sent.at(-1)!)).toMatchObject({
      user: { name: "Ada" },
      cursor: { anchors: [{ u: 0.2 }] },
    });
    client.dispose();
    vi.useRealTimers();
  });
});

describe("late join", () => {
  it("answers a first message from an unknown peer with one full publish", () => {
    vi.useFakeTimers();
    const { transport, sent, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, user: { name: "Ada" }, heartbeatMs: 60_000 });
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.1, v: 0.1 }] });
    vi.advanceTimersByTime(100);
    const before = sent.length;

    emit(
      new TextEncoder().encode(
        JSON.stringify({ version: 1, clientId: "peer", session: "s", sequence: 0, cursor: null }),
      ),
    );
    vi.advanceTimersByTime(600);

    expect(sent.length).toBe(before + 1);
    expect(decodeSent(sent.at(-1)!)).toMatchObject({ user: { name: "Ada" } });

    emit(
      new TextEncoder().encode(
        JSON.stringify({ version: 1, clientId: "peer", session: "s", sequence: 1, cursor: null }),
      ),
    );
    vi.advanceTimersByTime(600);
    expect(sent.length).toBe(before + 1);
    client.dispose();
    vi.useRealTimers();
  });

  it("answers a known clientId that returns with a new session", () => {
    vi.useFakeTimers();
    const { transport, sent, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory, user: { name: "Ada" }, heartbeatMs: 60_000 });
    const send = (session: string, sequence: number) =>
      emit(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, clientId: "peer", session, sequence, cursor: null }),
        ),
      );
    send("s1", 0);
    vi.advanceTimersByTime(600);
    const before = sent.length;

    send("s2", 0);
    vi.advanceTimersByTime(600);

    expect(sent.length).toBe(before + 1);
    client.dispose();
    vi.useRealTimers();
  });
});

describe("remote field validation warning", () => {
  it("warns once in dev mode when a remote user arrives without parseUser", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport, emit } = makeTransport();
    const client = createPresenceClient({ transport, idFactory });
    for (const sequence of [0, 1]) {
      emit(
        new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            clientId: "p",
            session: "s",
            sequence,
            cursor: null,
            user: { name: "x" },
          }),
        ),
      );
    }
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("parseUser"))).toHaveLength(1);
    client.dispose();
    warn.mockRestore();
  });
});

describe("default shape check for remote fields", () => {
  const remote = (emit: (data: Uint8Array) => void, clientId: string, user: unknown) =>
    emit(
      new TextEncoder().encode(
        JSON.stringify({ version: 1, clientId, session: "s", sequence: 0, cursor: null, user }),
      ),
    );

  it("drops a remote user that does not have the shape of the local user, and removes extra object keys", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<unknown, { name: string; tags: string[] }>({
      transport,
      idFactory,
      user: { name: "Ada", tags: ["x"] },
    });

    remote(emit, "bad-type", { name: {}, tags: ["a"] });
    remote(emit, "bad-array", { name: "B", tags: "nope" });
    remote(emit, "bad-item", { name: "B", tags: [1] });
    remote(emit, "good", { name: "Bob", tags: ["a", "b"], extra: "kept", nested: { evil: true } });

    const users = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.user]));
    expect(users).toEqual({
      "bad-type": undefined,
      "bad-array": undefined,
      "bad-item": undefined,
      good: { name: "Bob", tags: ["a", "b"], extra: "kept" },
    });
    client.dispose();
  });

  it("accepts only plain values where the local value is null or an empty array", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<unknown, { name: string; avatar: string | null; tags: string[] }>({
      transport,
      idFactory,
      user: { name: "Ada", avatar: null, tags: [] },
    });

    remote(emit, "object-avatar", { name: "B", avatar: { evil: true }, tags: [] });
    remote(emit, "object-tag", { name: "B", avatar: null, tags: [{ evil: true }] });
    remote(emit, "fine", { name: "B", avatar: "a.png", tags: ["x"] });

    const users = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.user]));
    expect(users).toEqual({
      "object-avatar": undefined,
      "object-tag": undefined,
      fine: { name: "B", avatar: "a.png", tags: ["x"] },
    });
    client.dispose();
  });

  it("keeps an optional context key that the local context lacks, as in a dialog flag", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<{ page: string; dialog?: string }>({
      transport,
      idFactory,
      context: { page: "dashboard" },
    });
    const send = (clientId: string, context: unknown) =>
      emit(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, clientId, session: "s", sequence: 0, cursor: null, context }),
        ),
      );

    send("dialog", { page: "orders", dialog: "settings" });
    send("object", { page: "orders", dialog: { evil: true } });

    const contexts = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.context]));
    expect(contexts).toEqual({
      dialog: { page: "orders", dialog: "settings" },
      object: { page: "orders" },
    });
    client.dispose();
  });

  it("accepts a remote null for any key and warns once when a value is dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<{ hover: { id: string } | null; name: string }>({
      transport,
      idFactory,
      context: { hover: { id: "a" }, name: "Ada" },
    });
    const send = (clientId: string, context: unknown) =>
      emit(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, clientId, session: "s", sequence: 0, cursor: null, context }),
        ),
      );

    send("cleared", { hover: null, name: "B" });
    send("bad-one", { hover: "nope", name: "B" });
    send("bad-two", { hover: 3, name: "B" });

    const contexts = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.context]));
    expect(contexts).toEqual({
      cleared: { hover: null, name: "B" },
      "bad-one": undefined,
      "bad-two": undefined,
    });
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("parseContext"))).toHaveLength(1);
    client.dispose();
    warn.mockRestore();
  });

  it("ignores prototype and inherited keys in a remote value", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<unknown, { name: string }>({
      transport,
      idFactory,
      user: { name: "Ada" },
    });
    const raw = (clientId: string, user: string) =>
      emit(
        new TextEncoder().encode(
          `{"version":1,"clientId":"${clientId}","session":"s","sequence":0,"cursor":null,"user":${user}}`,
        ),
      );

    raw("proto", '{"name":"x","__proto__":{"admin":true}}');
    raw("inherited", '{"name":"y","toString":"hijack","constructor":"c"}');

    const users = new Map(
      client.getRemotePresence().map((p) => [p.clientId, p.user as Record<string, unknown>]),
    );
    const proto = users.get("proto");
    expect(proto).toEqual({ name: "x" });
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect((proto as { admin?: unknown }).admin).toBeUndefined();
    expect(users.get("inherited")).toMatchObject({ name: "y" });
    expect(({} as { admin?: unknown }).admin).toBeUndefined();
    client.dispose();
  });

  it("lets an explicit parseUser replace the default check", () => {
    const { transport, emit } = makeTransport();
    const client = createPresenceClient<unknown, { name: string }>({
      transport,
      idFactory,
      user: { name: "Ada" },
      parseUser: (value) => {
        const { label } = value as { label?: unknown };
        return { name: typeof label === "string" ? label : "?" };
      },
    });
    remote(emit, "p", { label: "Zed" });
    expect(client.getRemotePresence()[0]?.user).toEqual({ name: "Zed" });
    client.dispose();
  });
});

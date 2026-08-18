import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { jsonCodec } from "../src/codec";
import type { LiveCursorTransport } from "../src/transport";
import type { ConnectionStatus } from "../src/protocol";

function makeTransport(withStatus = false) {
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
    client.updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
    vi.advanceTimersByTime(50);
    expect(sent).toHaveLength(0);
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
});

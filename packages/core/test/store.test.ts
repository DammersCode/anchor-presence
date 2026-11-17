import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IDLE_AFTER_MS, RemotePresenceStore } from "../src/store";
import type { CursorPresence } from "../src/protocol";

function presence(overrides: Partial<CursorPresence> = {}): CursorPresence {
  return {
    version: 1,
    clientId: "client-1",
    session: "session-1",
    sequence: 0,
    cursor: { anchors: [] },
    ...overrides,
  };
}

function makeClock(startAt = 0) {
  let time = startAt;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("RemotePresenceStore sequencing", () => {
  it("accepts an in-order sequence", () => {
    const store = new RemotePresenceStore();
    expect(store.ingest(presence({ sequence: 0 }))).toBe(true);
    expect(store.ingest(presence({ sequence: 1 }))).toBe(true);
    expect(store.getSnapshot()[0]?.sequence).toBe(1);
  });

  it("drops an out-of-order (<=) sequence within the same session", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 5 }));
    expect(store.ingest(presence({ sequence: 5 }))).toBe(false);
    expect(store.ingest(presence({ sequence: 3 }))).toBe(false);
    expect(store.getSnapshot()[0]?.sequence).toBe(5);
  });

  it("accepts and resets lastSequence on a session change", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ session: "session-1", sequence: 10 }));
    const accepted = store.ingest(presence({ session: "session-2", sequence: 0 }));
    expect(accepted).toBe(true);
    expect(store.getSnapshot()[0]?.session).toBe("session-2");
    expect(store.getSnapshot()[0]?.sequence).toBe(0);
  });

  it("duplicate clientId across sessions is last-write-wins", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ clientId: "shared", session: "tab-a", sequence: 100 }));
    store.ingest(presence({ clientId: "shared", session: "tab-b", sequence: 0 }));
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]?.session).toBe("tab-b");
  });

  it("cursor: null hides immediately (accepted as any other message)", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } }));
    store.ingest(presence({ sequence: 1, cursor: null }));
    expect(store.getSnapshot()[0]?.cursor).toBeNull();
  });
});

describe("RemotePresenceStore cap", () => {
  it("drops a new clientId beyond maxRemoteClients (default 64)", () => {
    const store = new RemotePresenceStore();
    for (let i = 0; i < 64; i++) {
      expect(store.ingest(presence({ clientId: `client-${i}` }))).toBe(true);
    }
    expect(store.getSnapshot()).toHaveLength(64);
    // the 65th distinct client is dropped
    expect(store.ingest(presence({ clientId: "client-64" }))).toBe(false);
    expect(store.getSnapshot()).toHaveLength(64);
  });

  it("still updates existing clients once at cap", () => {
    const store = new RemotePresenceStore({ maxRemoteClients: 2 });
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    store.ingest(presence({ clientId: "b", sequence: 0 }));
    expect(store.ingest(presence({ clientId: "c", sequence: 0 }))).toBe(false);
    expect(store.ingest(presence({ clientId: "a", sequence: 1 }))).toBe(true);
    expect(store.getSnapshot()).toHaveLength(2);
  });

  it("frees a slot on removal so a new client can join", () => {
    const store = new RemotePresenceStore({ maxRemoteClients: 1 });
    store.ingest(presence({ clientId: "a" }));
    expect(store.ingest(presence({ clientId: "b" }))).toBe(false);
    store.remove("a");
    expect(store.ingest(presence({ clientId: "b" }))).toBe(true);
  });

  it("reports dropped new clients without reporting updates to existing clients", () => {
    const onDropNewClient = vi.fn();
    const store = new RemotePresenceStore({ maxRemoteClients: 1, onDropNewClient });
    store.ingest(presence({ clientId: "a" }));
    store.ingest(presence({ clientId: "a", sequence: 1 }));
    expect(onDropNewClient).not.toHaveBeenCalled();

    expect(store.ingest(presence({ clientId: "b" }))).toBe(false);
    expect(onDropNewClient).toHaveBeenCalledTimes(1);
  });
});

describe("RemotePresenceStore stale sweep", () => {
  it("removes clients not seen for staleTimeoutMs using the injected clock", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ staleTimeoutMs: 1000, now: clock.now });
    store.ingest(presence({ clientId: "a" }));
    clock.advance(500);
    store.sweep();
    expect(store.getSnapshot()).toHaveLength(1);

    clock.advance(600); // total 1100ms since last seen
    store.sweep();
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("does not remove a client refreshed before the timeout", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ staleTimeoutMs: 1000, now: clock.now });
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    clock.advance(900);
    store.ingest(presence({ clientId: "a", sequence: 1 }));
    clock.advance(900);
    store.sweep();
    expect(store.getSnapshot()).toHaveLength(1);
  });
});

describe("RemotePresenceStore idle", () => {
  it("starts not idle and becomes idle after idleAfterMs with no message", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ idleAfterMs: 500, staleTimeoutMs: 10_000, now: clock.now });
    store.ingest(presence({ clientId: "a" }));
    expect(store.getStableSnapshot()[0]?.idle).toBe(false);

    clock.advance(400);
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(false);

    clock.advance(200); // total 600ms since last seen
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(true);
  });

  it("stays idle through heartbeats that change nothing", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ idleAfterMs: 500, staleTimeoutMs: 10_000, now: clock.now });
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    clock.advance(600);
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(true);

    store.ingest(presence({ clientId: "a", sequence: 1 }));
    clock.advance(600);
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(true);
  });

  it("clears idle when the presence changes", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ idleAfterMs: 500, staleTimeoutMs: 10_000, now: clock.now });
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    clock.advance(600);
    store.sweep();

    store.ingest(
      presence({ clientId: "a", sequence: 1, cursor: { anchors: [{ id: "x", u: 0.5, v: 0.5 }] } }),
    );
    expect(store.getStableSnapshot()[0]?.idle).toBe(false);
  });

  it("keeps entry and user identity when a heartbeat repeats an equal user", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ clientId: "a", sequence: 0, user: { name: "Ada", tags: ["x"] } }));
    const before = store.getStableSnapshot();
    store.ingest(presence({ clientId: "a", sequence: 1, user: { name: "Ada", tags: ["x"] } }));
    expect(store.getStableSnapshot()).toBe(before);
    expect(store.getStableSnapshot()[0]?.user).toBe(before[0]?.user);
  });

  it("removes a client on a leave message of the same session", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    expect(store.ingest(presence({ clientId: "a", sequence: 1, cursor: null, leave: true }))).toBe(true);
    expect(store.getStableSnapshot()).toHaveLength(0);
    expect(store.hasActiveCursors()).toBe(false);
  });

  it("ignores a leave from an older session or an unknown client", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ clientId: "a", session: "new", sequence: 0 }));
    expect(
      store.ingest(presence({ clientId: "a", session: "old", sequence: 9, cursor: null, leave: true })),
    ).toBe(false);
    expect(store.ingest(presence({ clientId: "b", sequence: 1, cursor: null, leave: true }))).toBe(false);
    expect(store.getStableSnapshot()).toHaveLength(1);
  });

  it("keeps stable snapshot and entry identity while idle does not change", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ idleAfterMs: 500, staleTimeoutMs: 10_000, now: clock.now });
    store.ingest(presence({ clientId: "a" }));
    const before = store.getStableSnapshot();

    clock.advance(100);
    store.sweep();
    expect(store.getStableSnapshot()).toBe(before);
  });

  it("clamps idleAfterMs below staleTimeoutMs, so a peer never reports idle after removal", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ idleAfterMs: 10_000, staleTimeoutMs: 1000, now: clock.now });
    store.ingest(presence({ clientId: "a" }));
    clock.advance(1100);
    store.sweep();
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("defaults to DEFAULT_IDLE_AFTER_MS when omitted", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ now: clock.now });
    store.ingest(presence({ clientId: "a" }));
    clock.advance(DEFAULT_IDLE_AFTER_MS - 1);
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(false);

    clock.advance(2);
    store.sweep();
    expect(store.getStableSnapshot()[0]?.idle).toBe(true);
  });
});

describe("RemotePresenceStore snapshot immutability", () => {
  it("returns a new array identity only when content changed", () => {
    const store = new RemotePresenceStore();
    const empty1 = store.getSnapshot();
    const empty2 = store.getSnapshot();
    expect(empty1).toBe(empty2);

    store.ingest(presence({ clientId: "a" }));
    const afterIngest = store.getSnapshot();
    expect(afterIngest).not.toBe(empty1);

    const afterIngestAgain = store.getSnapshot();
    expect(afterIngestAgain).toBe(afterIngest);

    // a dropped (stale-sequence) ingest must not change identity
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    expect(store.getSnapshot()).toBe(afterIngest);
  });

  it("notifies subscribers only on accepted changes", () => {
    const store = new RemotePresenceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.ingest(presence({ clientId: "a", sequence: 0 }));
    expect(listener).toHaveBeenCalledTimes(1);

    store.ingest(presence({ clientId: "a", sequence: 0 })); // stale, dropped
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.ingest(presence({ clientId: "a", sequence: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("RemotePresenceStore context/user field delta", () => {
  it("normalizes an explicit null context/user on first ingest", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ context: null, user: null }));
    const entry = store.getSnapshot()[0]!;
    expect(entry.context).toBeUndefined();
    expect(entry.user).toBeUndefined();
  });

  it("keeps omitted context and user from the previous same-session message", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, context: { route: "/" }, user: { name: "Ada" } }));
    store.ingest(presence({ sequence: 1 }));
    const entry = store.getSnapshot()[0]!;
    expect(entry.sequence).toBe(1);
    expect(entry.context).toEqual({ route: "/" });
    expect(entry.user).toEqual({ name: "Ada" });
  });

  it("does not materialize absent fields as own undefined properties", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, user: { name: "Ada" } }));
    store.ingest(presence({ sequence: 1 }));

    const inherited = store.getSnapshot()[0]!;
    expect("context" in inherited).toBe(false);
    expect("user" in inherited).toBe(true);
    expect(inherited.user).toEqual({ name: "Ada" });

    store.ingest(presence({ sequence: 2, context: null, user: null }));
    const cleared = store.getSnapshot()[0]!;
    expect("context" in cleared).toBe(false);
    expect("user" in cleared).toBe(false);
  });

  it("clears context and user when a same-session message sends explicit null", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, context: { route: "/" }, user: { name: "Ada" } }));
    store.ingest(presence({ sequence: 1, context: null, user: null }));
    const entry = store.getSnapshot()[0]!;
    expect(entry.context).toBeUndefined();
    expect(entry.user).toBeUndefined();
  });

  it("does not inherit omitted context or user across a session change", () => {
    const store = new RemotePresenceStore();
    store.ingest(
      presence({ session: "session-1", sequence: 5, context: { route: "/" }, user: { name: "Ada" } }),
    );
    store.ingest(presence({ session: "session-2", sequence: 0 }));
    const entry = store.getSnapshot()[0]!;
    expect(entry.session).toBe("session-2");
    expect(entry.context).toBeUndefined();
    expect(entry.user).toBeUndefined();
  });

  it("still drops a stale same-session message whose omitted fields would inherit state", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 2, context: { route: "/" } }));
    expect(store.ingest(presence({ sequence: 1 }))).toBe(false);
    expect(store.getSnapshot()[0]!.sequence).toBe(2);
  });
});

describe("RemotePresenceStore stable snapshot", () => {
  it("keeps stable array and entry identity across higher-sequence messages with unchanged content", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0 }));
    const stable0 = store.getStableSnapshot();
    const raw0 = store.getSnapshot();
    expect("sequence" in stable0[0]!).toBe(false);

    store.ingest(presence({ sequence: 1 }));
    expect(store.getStableSnapshot()).toBe(stable0);
    expect(store.getStableSnapshot()[0]!).toBe(stable0[0]!);
    expect(store.getSnapshot()).not.toBe(raw0);
    expect(store.getSnapshot()[0]!.sequence).toBe(1);
  });

  it("changes the stable snapshot when an observable field changes", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } }));
    let before = store.getStableSnapshot();

    store.ingest(presence({ sequence: 1, cursor: { anchors: [{ id: "a", u: 0.9, v: 0.5 }] } }));
    expect(store.getStableSnapshot()).not.toBe(before);
    before = store.getStableSnapshot();

    const anchored = { anchors: [{ id: "a", u: 0.9, v: 0.5 }] };
    store.ingest(presence({ sequence: 2, cursor: anchored, context: { route: "/" } }));
    expect(store.getStableSnapshot()).not.toBe(before);
    before = store.getStableSnapshot();

    store.ingest(presence({ sequence: 3, cursor: anchored, user: { name: "Ada" } }));
    expect(store.getStableSnapshot()).not.toBe(before);
    before = store.getStableSnapshot();

    store.ingest(presence({ sequence: 4, cursor: anchored, pointer: { type: "pen" } }));
    expect(store.getStableSnapshot()).not.toBe(before);
    before = store.getStableSnapshot();

    store.ingest(presence({ session: "session-2", sequence: 5 }));
    expect(store.getStableSnapshot()).not.toBe(before);
  });

  it("treats inherited (omitted) context and user as unchanged", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, context: { route: "/" }, user: { name: "Ada" } }));
    const before = store.getStableSnapshot();
    store.ingest(presence({ sequence: 1 }));
    expect(store.getStableSnapshot()).toBe(before);
    expect(store.getStableSnapshot()[0]!.context).toEqual({ route: "/" });
    expect(store.getStableSnapshot()[0]!.user).toEqual({ name: "Ada" });
  });

  it("keeps entry identity when another client joins, and rebuilds on removal and sweep", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ staleTimeoutMs: 1000, now: clock.now });
    store.ingest(presence({ clientId: "a", sequence: 0 }));
    const withA = store.getStableSnapshot();
    store.ingest(presence({ clientId: "b", sequence: 0 }));
    const withAB = store.getStableSnapshot();
    expect(withAB).not.toBe(withA);
    expect(withAB[0]!).toBe(withA[0]!);

    store.remove("b");
    expect(store.getStableSnapshot()).not.toBe(withAB);
    expect(store.getStableSnapshot()).toHaveLength(1);

    clock.advance(1100);
    store.sweep();
    expect(store.getStableSnapshot()).toHaveLength(0);
  });

  it("notifies subscribers on accepted ingests that change no observable field", () => {
    const store = new RemotePresenceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.ingest(presence({ sequence: 0 }));
    store.ingest(presence({ sequence: 1 }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

describe("RemotePresenceStore hasActiveCursors", () => {
  it("counts a cursor on first ingest and drops it on a null cursor", () => {
    const store = new RemotePresenceStore();
    expect(store.hasActiveCursors()).toBe(false);
    store.ingest(presence({ sequence: 0, cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } }));
    expect(store.hasActiveCursors()).toBe(true);
    store.ingest(presence({ sequence: 1, cursor: null }));
    expect(store.hasActiveCursors()).toBe(false);
  });

  it("recounts when a client with a cursor becomes stale and is swept", () => {
    const clock = makeClock();
    const store = new RemotePresenceStore({ staleTimeoutMs: 1000, idleAfterMs: 500, now: clock.now });
    store.ingest(presence({ sequence: 0, cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } }));
    expect(store.hasActiveCursors()).toBe(true);
    clock.advance(1100);
    store.sweep();
    expect(store.hasActiveCursors()).toBe(false);
  });

  it("drops the count on remove and ignores removing an unknown client", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 0, cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } }));
    store.remove("client-1");
    expect(store.hasActiveCursors()).toBe(false);
    expect(() => store.remove("unknown")).not.toThrow();
  });
});

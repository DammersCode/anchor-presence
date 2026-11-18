import { describe, expect, it } from "vitest";
import { RemotePresenceStore } from "../src/store";
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

describe("RemotePresenceStore leave and peer data", () => {
  it("ignores a leave whose sequence is not newer than the stored one", () => {
    const store = new RemotePresenceStore();
    store.ingest(presence({ sequence: 5 }));
    expect(store.ingest(presence({ sequence: 5, leave: true, cursor: null }))).toBe(false);
    expect(store.ingest(presence({ sequence: 3, leave: true, cursor: null }))).toBe(false);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.ingest(presence({ sequence: 6, leave: true, cursor: null }))).toBe(true);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("reports user and context in a peer change, and the last values on leave", () => {
    const store = new RemotePresenceStore();
    const changes: unknown[] = [];
    store.subscribePeers((change) => changes.push(change));
    store.ingest(presence({ sequence: 0, user: { name: "Ada" }, context: { page: "a" } }));
    store.ingest(presence({ sequence: 1, leave: true, cursor: null }));
    expect(changes).toEqual([
      { type: "join", clientId: "client-1", user: { name: "Ada" }, context: { page: "a" } },
      { type: "leave", clientId: "client-1", user: { name: "Ada" }, context: { page: "a" } },
    ]);
  });
});

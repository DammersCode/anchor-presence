import { describe, expect, it } from "vitest";

describe("@anchor-presence/react public runtime API", () => {
  it("exposes the current runtime exports and no anchor-registration hook", async () => {
    const mod = await import("../src");

    expect(Object.keys(mod).toSorted()).toEqual([
      "CursorLayer",
      "DefaultCursor",
      "PresenceContext",
      "PresenceProvider",
      "createPresenceHooks",
      "useLocalContext",
      "useLocalUser",
      "usePeerChanges",
      "usePresenceBinding",
      "usePresenceClient",
      "usePresenceStatus",
      "useRemoteCursors",
      "useRemoteCursorsSelector",
      "useRemoteEvents",
      "useRemotePresence",
      "useRemoteUsers",
      "useSendEvent",
    ]);
  });
});

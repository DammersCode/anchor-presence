import { describe, expect, it } from "vitest";

describe("@dammers/anchor-presence-react public runtime API", () => {
  it("exposes the current runtime exports and no anchor-registration hook", async () => {
    const mod = await import("../src");

    expect(Object.keys(mod).toSorted()).toEqual([
      "CursorLayer",
      "DefaultCursor",
      "PresenceProvider",
      "PresenceProviderContext",
      "createPresenceHooks",
      "useDomBinding",
      "useLocalContext",
      "useLocalUser",
      "usePeerChanges",
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

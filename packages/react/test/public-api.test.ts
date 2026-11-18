import { describe, expect, it } from "vitest";

describe("@anchor-presence/react public runtime API", () => {
  it("exposes the current runtime exports and no anchor-registration hook", async () => {
    const mod = await import("../src");

    expect(Object.keys(mod).toSorted()).toEqual([
      "CursorLayer",
      "DefaultCursor",
      "LiveCursorContext",
      "LiveCursorProvider",
      "createPresenceHooks",
      "useCursorBinding",
      "useCursorClient",
      "useCursorContext",
      "useCursorEvents",
      "useCursorPresence",
      "useCursorStatus",
      "useLocalUser",
      "usePeerChanges",
      "useRemoteCursors",
      "useRemoteCursorsSelector",
      "useRemoteUsers",
    ]);
  });
});

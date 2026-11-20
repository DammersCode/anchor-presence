import { describe, expect, it } from "vitest";

describe("@dammers/anchor-presence-dom public runtime API", () => {
  it("exposes only the approved runtime exports", async () => {
    const mod = await import("../src");

    expect(Object.keys(mod).toSorted()).toEqual([
      "CURSOR_MARKER_ATTRIBUTE",
      "createBroadcastChannelTransport",
      "createDomBinding",
      "createWebSocketTransport",
    ]);
  });
});

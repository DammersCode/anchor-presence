import { describe, expect, it } from "vitest";

describe("@anchor-presence/core public runtime API", () => {
  it("exposes only the approved runtime exports", async () => {
    const mod = await import("../src");

    expect(Object.keys(mod).toSorted()).toEqual([
      "DEFAULT_HEARTBEAT_MS",
      "DEFAULT_IDLE_AFTER_MS",
      "DEFAULT_MAX_ANCHORS",
      "DEFAULT_MAX_ANCHOR_ID_LENGTH",
      "DEFAULT_MAX_CLIENT_ID_LENGTH",
      "DEFAULT_MAX_FIELD_BYTES",
      "DEFAULT_MAX_FIELD_DEPTH",
      "DEFAULT_MAX_MESSAGE_BYTES",
      "DEFAULT_MAX_REMOTE_CLIENTS",
      "DEFAULT_MAX_SEQUENCE",
      "DEFAULT_MAX_SESSION_LENGTH",
      "DEFAULT_PUBLISH_INTERVAL_MS",
      "DEFAULT_STALE_TIMEOUT_MS",
      "RemotePresenceStore",
      "binaryCodec",
      "createInMemoryPair",
      "createPresenceClient",
      "isDevMode",
      "jsonCodec",
      "linearInterpolator",
      "noneInterpolator",
      "validatePresence",
    ]);
  });
});

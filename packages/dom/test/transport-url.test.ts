import { describe, expect, it } from "vitest";
import { createWebSocketTransport } from "../src/transport";

describe("createWebSocketTransport url options", () => {
  it("throws for a path that does not start with a slash or a question mark", () => {
    expect(() => createWebSocketTransport({ path: "room=main" })).toThrow(TypeError);
    expect(() => createWebSocketTransport({ path: "/presence?room=main" })).not.toThrow();
    expect(() => createWebSocketTransport({ path: "?room=main" })).not.toThrow();
  });
});

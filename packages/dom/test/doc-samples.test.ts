import { describe, expect, it } from "vitest";
import { createWebSocketTransport } from "../src/transport";

describe("websocket-transport doc samples", () => {
  it("builds a transport with an async token function", () => {
    const transport = createWebSocketTransport({
      url: "wss://relay.example.com/?room=main",
      token: async () => (await fetch("/api/room-token")).text(),
    });
    expect(transport.getStatus?.()).toBe("connecting");
  });
});

import { describe, expect, it } from "vitest";
import { jsonCodec } from "../src/codec";
import type { CursorPresence } from "../src/protocol";

describe("jsonCodec", () => {
  it("round-trips a valid message", () => {
    const message: CursorPresence = {
      version: 1,
      clientId: "client-1",
      session: "session-1",
      sequence: 42,
      cursor: { anchors: [{ id: "nav.dashboard", u: 0.25, v: 0.75 }], viewport: { u: 0.1, v: 0.2 } },
      context: { route: "/dashboard" },
      user: { name: "Ada" },
    };

    const encoded = jsonCodec.encode(message);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = jsonCodec.decode(encoded);
    expect(decoded).toEqual(message);
  });

  it("returns null for malformed bytes", () => {
    const garbage = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02]);
    expect(jsonCodec.decode(garbage)).toBeNull();
  });

  it("returns null for truncated JSON", () => {
    const truncated = new TextEncoder().encode('{"version":1,"clientId":"a"');
    expect(jsonCodec.decode(truncated)).toBeNull();
  });

  it("never throws on decode", () => {
    expect(() => jsonCodec.decode(new Uint8Array())).not.toThrow();
    expect(() => jsonCodec.decode(new TextEncoder().encode("not json at all"))).not.toThrow();
  });
});

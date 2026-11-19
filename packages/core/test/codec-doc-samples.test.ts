import { afterEach, describe, expect, it, vi } from "vitest";
import { binaryCodec, type PresenceCodec, type PresenceMessage } from "@anchor-presence/core";

// Copied verbatim from apps/docs/content/docs/core/custom-codec.mdx (Debugging, option B).
const debugCodec: PresenceCodec = {
  encode(message) {
    console.debug("[presence out]", message);
    return binaryCodec.encode(message);
  },
  decode(data) {
    const value = binaryCodec.decode(data);
    console.debug("[presence in]", value);
    return value;
  },
};

const message: PresenceMessage = {
  version: 1,
  clientId: "client-1",
  session: "session-1",
  sequence: 7,
  cursor: {
    anchors: [{ id: "nav.dashboard", u: 0.1, v: 0.3 }],
    viewport: { u: 0.7, v: 0.9 },
  },
  user: { name: "Ada" },
  pointer: { type: "mouse" },
};

describe("codecs docs: debugCodec", () => {
  afterEach(() => vi.restoreAllMocks());

  it("round-trips a message through binaryCodec and logs both directions", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    const decoded = debugCodec.decode(debugCodec.encode(message)) as PresenceMessage;

    const { cursor, ...rest } = decoded;
    const { cursor: _sentCursor, ...sentRest } = message;
    expect(rest).toEqual(sentRest);
    const anchor = cursor?.anchors[0];
    expect(anchor?.id).toBe("nav.dashboard");
    expect(anchor?.u).toBeCloseTo(0.1, 6);
    expect(anchor?.v).toBeCloseTo(0.3, 6);
    expect(cursor?.viewport?.u).toBeCloseTo(0.7, 6);
    expect(cursor?.viewport?.v).toBeCloseTo(0.9, 6);
    expect(debug).toHaveBeenCalledWith("[presence out]", message);
    expect(debug).toHaveBeenCalledWith("[presence in]", decoded);
  });

  it("keeps a float32 coordinate within 1e-7 of the sent value", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const decoded = debugCodec.decode(debugCodec.encode(message)) as PresenceMessage;
    const u = decoded.cursor?.anchors[0]?.u;
    expect(u).not.toBe(0.1);
    expect(u).toBeCloseTo(0.1, 7);
  });
});

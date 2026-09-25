import { afterEach, describe, expect, it, vi } from "vitest";
import { binaryCodec, type CursorCodec, type CursorPresence } from "@anchor-presence/core";

// Copied verbatim from apps/docs/content/docs/core/codecs.mdx (Debugging, option B).
const debugCodec: CursorCodec = {
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

const message: CursorPresence = {
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

    const decoded = debugCodec.decode(debugCodec.encode(message)) as CursorPresence;

    const { cursor, ...rest } = decoded;
    const { cursor: sentCursor, ...sentRest } = message;
    expect(rest).toEqual(sentRest);
    const [anchor] = cursor?.anchors ?? [];
    expect(anchor?.id).toBe("nav.dashboard");
    expect(anchor?.u).toBeCloseTo(sentCursor?.anchors[0]?.u ?? Number.NaN, 6);
    expect(anchor?.v).toBeCloseTo(sentCursor?.anchors[0]?.v ?? Number.NaN, 6);
    expect(cursor?.viewport?.u).toBeCloseTo(0.7, 6);
    expect(cursor?.viewport?.v).toBeCloseTo(0.9, 6);
    expect(debug).toHaveBeenCalledWith("[presence out]", message);
    expect(debug).toHaveBeenCalledWith("[presence in]", decoded);
  });

  it("keeps a float32 coordinate within 1e-7 of the sent value", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const decoded = debugCodec.decode(debugCodec.encode(message)) as CursorPresence;
    const u = decoded.cursor?.anchors[0]?.u ?? Number.NaN;
    expect(u).not.toBe(0.1);
    expect(Math.abs(u - 0.1)).toBeLessThan(1e-7);
  });
});

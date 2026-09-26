import { afterEach, describe, expect, it, vi } from "vitest";
import { binaryCodec } from "../src/binary-codec";
import { jsonCodec } from "../src/codec";
import { createInMemoryPair } from "../src/in-memory-transport";
import { createPresenceClient } from "../src/client";
import { validatePresence } from "../src/validate";
import type { CursorPresence } from "../src/protocol";

function fullMessage(): CursorPresence {
  return {
    version: 1,
    clientId: "client-1",
    session: "session-1",
    sequence: 42,
    cursor: {
      anchors: [
        { id: "nav.dashboard", u: 0.25, v: 0.75 },
        { id: "sidebar", u: 0.1, v: 0.9 },
      ],
      viewport: { u: 0.1, v: 0.2 },
    },
    context: { route: "/dashboard", dialog: null },
    user: { name: "Ada", color: "#6366f1" },
    pointer: { type: "mouse" },
  };
}

describe("binaryCodec", () => {
  it("round-trips a full message", () => {
    const message = fullMessage();
    const encoded = binaryCodec.encode(message);
    expect(encoded).toBeInstanceOf(Uint8Array);

    const decoded = binaryCodec.decode(encoded) as CursorPresence;
    expect(validatePresence(decoded)).not.toBeNull();
    expect(decoded.version).toBe(1);
    expect(decoded.clientId).toBe("client-1");
    expect(decoded.session).toBe("session-1");
    expect(decoded.sequence).toBe(42);
    expect(decoded.cursor?.anchors).toHaveLength(2);
    expect(decoded.cursor?.anchors[0]?.id).toBe("nav.dashboard");
    expect(decoded.cursor?.anchors[0]?.u).toBeCloseTo(0.25);
    expect(decoded.cursor?.anchors[0]?.v).toBeCloseTo(0.75);
    expect(decoded.cursor?.anchors[1]?.id).toBe("sidebar");
    expect(decoded.cursor?.anchors[1]?.u).toBeCloseTo(0.1);
    expect(decoded.cursor?.anchors[1]?.v).toBeCloseTo(0.9);
    expect(decoded.cursor?.viewport?.u).toBeCloseTo(0.1);
    expect(decoded.cursor?.viewport?.v).toBeCloseTo(0.2);
    expect(decoded.pointer).toEqual({ type: "mouse" });
    expect(decoded.context).toEqual({ route: "/dashboard", dialog: null });
    expect(decoded.user).toEqual({ name: "Ada", color: "#6366f1" });
  });

  it("round-trips explicit null cursor, context, and user", () => {
    const message: CursorPresence = {
      version: 1,
      clientId: "client-1",
      session: "session-1",
      sequence: 7,
      cursor: null,
      context: null,
      user: null,
    };

    const decoded = binaryCodec.decode(binaryCodec.encode(message)) as CursorPresence;
    expect(decoded.cursor).toBeNull();
    expect("context" in decoded).toBe(true);
    expect(decoded.context).toBeNull();
    expect("user" in decoded).toBe(true);
    expect(decoded.user).toBeNull();
  });

  it("omits absent cursor metadata, context, user, and pointer", () => {
    const message: CursorPresence = {
      version: 1,
      clientId: "client-1",
      session: "session-1",
      sequence: 1,
      cursor: { anchors: [] },
    };

    const decoded = binaryCodec.decode(binaryCodec.encode(message)) as CursorPresence;
    expect(decoded.cursor).toEqual({ anchors: [] });
    expect("viewport" in decoded.cursor!).toBe(false);
    expect("context" in decoded).toBe(false);
    expect("user" in decoded).toBe(false);
    expect("pointer" in decoded).toBe(false);
  });

  it("round-trips pointer variants", () => {
    const base = {
      version: 1,
      clientId: "client-1",
      session: "session-1",
      sequence: 1,
      cursor: null,
    } as const;

    const cases: { pointer: CursorPresence["pointer"]; expected: CursorPresence["pointer"] }[] = [
      { pointer: undefined, expected: undefined },
      { pointer: {}, expected: {} },
      { pointer: { type: "mouse" }, expected: { type: "mouse" } },
      { pointer: { type: "pen" }, expected: { type: "pen" } },
      { pointer: { type: "touch" }, expected: { type: "touch" } },
    ];

    for (const { pointer, expected } of cases) {
      const message = { ...base, pointer } as unknown as CursorPresence;
      const decoded = binaryCodec.decode(binaryCodec.encode(message)) as CursorPresence;
      expect(decoded.pointer).toEqual(expected);
      expect("pointer" in decoded).toBe(pointer !== undefined);
    }
  });

  it("is smaller than jsonCodec for a typical multi-anchor message", () => {
    const message = fullMessage();
    const binary = binaryCodec.encode(message);
    const json = jsonCodec.encode(message);
    expect(binary.byteLength).toBeLessThan(json.byteLength);
  });

  it("returns null for malformed or truncated bytes", () => {
    const encoded = binaryCodec.encode(fullMessage());

    expect(binaryCodec.decode(new Uint8Array())).toBeNull();
    for (let length = 0; length < encoded.length; length++) {
      expect(binaryCodec.decode(encoded.slice(0, length))).toBeNull();
    }

    const badMagic = encoded.slice();
    badMagic[0] = 0x00;
    expect(binaryCodec.decode(badMagic)).toBeNull();

    const badFormat = encoded.slice();
    badFormat[1] = 3;
    expect(binaryCodec.decode(badFormat)).toBeNull();

    const badProtocolVersion = encoded.slice();
    badProtocolVersion[2] = 2;
    expect(binaryCodec.decode(badProtocolVersion)).toBeNull();

    expect(binaryCodec.decode(jsonCodec.encode(fullMessage()))).toBeNull();
  });

  it("rejects invalid structural tags", () => {
    const minimal = binaryCodec.encode({
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: null,
    });

    const badCursor = minimal.slice();
    badCursor[13] = 9;
    expect(binaryCodec.decode(badCursor)).toBeNull();

    const badPointer = minimal.slice();
    badPointer[minimal.length - 3] = 9;
    expect(binaryCodec.decode(badPointer)).toBeNull();

    const badContext = minimal.slice();
    badContext[minimal.length - 2] = 9;
    expect(binaryCodec.decode(badContext)).toBeNull();

    const badUser = minimal.slice();
    badUser[minimal.length - 1] = 9;
    expect(binaryCodec.decode(badUser)).toBeNull();

    const noAnchors = binaryCodec.encode({
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: { anchors: [] },
    });
    const badViewport = noAnchors.slice();
    badViewport[15] = 9;
    expect(binaryCodec.decode(badViewport)).toBeNull();
  });

  it("applies the shared sequence cap on encode", () => {
    const base = {
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: null,
    } as const;

    const atLimit = { ...base, sequence: 2_147_483_647 } as CursorPresence;
    expect(validatePresence(binaryCodec.decode(binaryCodec.encode(atLimit)))).not.toBeNull();

    const aboveLimit = { ...base, sequence: 2_147_483_648 } as CursorPresence;
    expect(() => binaryCodec.encode(aboveLimit)).toThrow("sequence out of range");
  });

  it("rejects a binary wire sequence above the cap at validation", () => {
    const encoded = binaryCodec.encode({
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: null,
    });

    // sequence is the uint32 right after the session string (offset 9 for "a"/"s")
    const spoofed = encoded.slice();
    new DataView(spoofed.buffer).setUint32(9, 0xffffffff, true);

    const decoded = binaryCodec.decode(spoofed);
    expect(decoded).not.toBeNull();
    expect(validatePresence(decoded)).toBeNull();
  });

  it("round-trips unicode clientId, session, anchor ids, and JSON fields", () => {
    const message: CursorPresence = {
      version: 1,
      clientId: "client-äöü-😀",
      session: "Sitzung-1",
      sequence: 9,
      cursor: {
        anchors: [{ id: "navigation.Übersicht", u: 0.5, v: 0.5 }],
      },
      context: { message: "ÄÖÜ 中文" },
      user: { name: "Zoë" },
    };

    const decoded = binaryCodec.decode(binaryCodec.encode(message)) as CursorPresence;
    expect(decoded.clientId).toBe("client-äöü-😀");
    expect(decoded.session).toBe("Sitzung-1");
    expect(decoded.cursor?.anchors[0]?.id).toBe("navigation.Übersicht");
    expect(decoded.context).toEqual({ message: "ÄÖÜ 中文" });
    expect(decoded.user).toEqual({ name: "Zoë" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("encode throws on JSON-unsafe context and user values", () => {
    const base = {
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: null,
    } as const;

    // JSON.stringify(10n) throws a TypeError per spec
    expect(() => binaryCodec.encode({ ...base, context: { big: 10n } })).toThrow(TypeError);

    // a top-level function or symbol stringifies to undefined
    for (const message of [
      { ...base, context: () => 1 },
      { ...base, user: Symbol("tag") },
    ] satisfies CursorPresence[]) {
      expect(() => binaryCodec.encode(message)).toThrow("cannot encode field as JSON");
    }
  });

  it("encode throws on unsupported pointer types, bad version, and oversized identifiers", () => {
    const base = {
      version: 1,
      clientId: "a",
      session: "s",
      sequence: 0,
      cursor: null,
    } as const;

    expect(() =>
      binaryCodec.encode({ ...base, pointer: { type: "stylus" } } as unknown as CursorPresence),
    ).toThrow("unsupported pointer type");
    expect(() => binaryCodec.encode({ ...base, version: 2 } as unknown as CursorPresence)).toThrow(
      "unsupported protocol version",
    );
    expect(() => binaryCodec.encode({ ...base, clientId: "a".repeat(65536) })).toThrow("clientId too large");
    expect(() => binaryCodec.encode({ ...base, session: "s".repeat(65536) })).toThrow("session too large");
  });

  it("encode throws on more than 255 anchors", () => {
    const anchors = Array.from({ length: 256 }, (_, i) => ({ id: `a${i}`, u: 0, v: 0 }));
    expect(() =>
      binaryCodec.encode({ version: 1, clientId: "a", session: "s", sequence: 0, cursor: { anchors } }),
    ).toThrow("too many anchors");
  });

  it("the presence client skips unencodable messages without throwing and recovers once the value is fixed", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a, codec: binaryCodec, publishIntervalMs: 10 });
    const receiver = createPresenceClient({ transport: b, codec: binaryCodec, publishIntervalMs: 10 });
    void a.connect();
    void b.connect();

    sender.setContext({ big: 10n });
    sender.updateLocalCursor({ anchors: [] });
    // the encode error is swallowed inside send(): no uncaught throw, nothing on the wire
    expect(() => vi.advanceTimersByTime(10)).not.toThrow();
    expect(receiver.getRemoteSnapshot()).toHaveLength(0);

    sender.setContext({ ok: "fine" });
    vi.advanceTimersByTime(200); // retry backoff delivers the fixed message
    const snapshot = receiver.getRemoteSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.clientId).toBe(sender.clientId);
    expect(snapshot[0]?.context).toEqual({ ok: "fine" });
    expect(warn).toHaveBeenCalled();

    sender.dispose();
    receiver.dispose();
  });
});

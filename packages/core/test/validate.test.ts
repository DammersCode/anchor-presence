import { describe, expect, it } from "vitest";
import { validatePresence } from "../src/validate";

function baseMessage(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    clientId: "client-1",
    session: "session-1",
    sequence: 0,
    cursor: { anchors: [] },
    ...overrides,
  };
}

describe("validatePresence", () => {
  it("accepts a minimal valid message", () => {
    const result = validatePresence(baseMessage());
    expect(result).toEqual({
      version: 1,
      clientId: "client-1",
      session: "session-1",
      sequence: 0,
      cursor: { anchors: [] },
    });
  });

  it("drops non-object input", () => {
    const missing: unknown = undefined;
    expect(validatePresence(null)).toBeNull();
    expect(validatePresence(missing)).toBeNull();
    expect(validatePresence("string")).toBeNull();
    expect(validatePresence(42)).toBeNull();
    expect(validatePresence([])).toBeNull();
  });

  it("drops when version is not 1", () => {
    expect(validatePresence(baseMessage({ version: 2 }))).toBeNull();
    expect(validatePresence(baseMessage({ version: "1" }))).toBeNull();
    expect(validatePresence(baseMessage({ version: undefined }))).toBeNull();
  });

  it("drops when clientId is missing, empty, non-string, or too long", () => {
    expect(validatePresence(baseMessage({ clientId: undefined }))).toBeNull();
    expect(validatePresence(baseMessage({ clientId: "" }))).toBeNull();
    expect(validatePresence(baseMessage({ clientId: 123 }))).toBeNull();
    expect(validatePresence(baseMessage({ clientId: "a".repeat(129) }))).toBeNull();
    expect(validatePresence(baseMessage({ clientId: "a".repeat(128) }))).not.toBeNull();
    expect(validatePresence(baseMessage({ clientId: "a" }))).not.toBeNull();
  });

  it("drops when session is missing, empty, non-string, or too long", () => {
    expect(validatePresence(baseMessage({ session: undefined }))).toBeNull();
    expect(validatePresence(baseMessage({ session: "" }))).toBeNull();
    expect(validatePresence(baseMessage({ session: 123 }))).toBeNull();
    expect(validatePresence(baseMessage({ session: "a".repeat(65) }))).toBeNull();
    expect(validatePresence(baseMessage({ session: "a".repeat(64) }))).not.toBeNull();
  });

  it("drops when sequence is not a finite non-negative integer", () => {
    expect(validatePresence(baseMessage({ sequence: -1 }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: 1.5 }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: NaN }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: Infinity }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: "0" }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: 0 }))).not.toBeNull();
    expect(validatePresence(baseMessage({ sequence: 9999 }))).not.toBeNull();
  });

  it("drops the message when sequence exceeds the max (spoof lockout guard)", () => {
    expect(validatePresence(baseMessage({ sequence: 2_147_483_647 }))).not.toBeNull();
    expect(validatePresence(baseMessage({ sequence: 2_147_483_648 }))).toBeNull();
    expect(validatePresence(baseMessage({ sequence: 1e21 }))).toBeNull();
  });

  it("respects an overridden maxSequence", () => {
    expect(validatePresence(baseMessage({ sequence: 100 }), { maxSequence: 99 })).toBeNull();
    expect(validatePresence(baseMessage({ sequence: 99 }), { maxSequence: 99 })).not.toBeNull();
  });

  it("truncates anchors beyond the max of 8", () => {
    const anchors = Array.from({ length: 12 }, (_, i) => ({ id: `anchor-${i}`, u: 0.5, v: 0.5 }));
    const result = validatePresence(baseMessage({ cursor: { anchors } }));
    expect(result?.cursor?.anchors).toHaveLength(8);
    expect(result?.cursor?.anchors.map((a) => a.id)).toEqual(
      anchors.slice(0, 8).map((a) => a.id),
    );
  });

  it("drops an individual anchor entry with a bad id", () => {
    const anchors = [
      { id: "good", u: 0.5, v: 0.5 },
      { id: "", u: 0.5, v: 0.5 }, // empty: dropped
      { id: 123, u: 0.5, v: 0.5 }, // non-string: dropped
      { id: "a".repeat(257), u: 0.5, v: 0.5 }, // too long: dropped
      { id: "a".repeat(256), u: 0.5, v: 0.5 }, // exactly at limit: kept
    ];
    const result = validatePresence(baseMessage({ cursor: { anchors } }));
    expect(result?.cursor?.anchors.map((a) => a.id)).toEqual(["good", "a".repeat(256)]);
  });

  it("clamps anchor u/v to [0, 1]", () => {
    const anchors = [
      { id: "a", u: -5, v: 5 },
      { id: "b", u: 0.5, v: 0.5 },
    ];
    const result = validatePresence(baseMessage({ cursor: { anchors } }));
    expect(result?.cursor?.anchors[0]).toEqual({ id: "a", u: 0, v: 1 });
    expect(result?.cursor?.anchors[1]).toEqual({ id: "b", u: 0.5, v: 0.5 });
  });

  it("drops an anchor entry when u or v is not a finite number", () => {
    const anchors = [
      { id: "bad-u", u: "0.5", v: 0.5 },
      { id: "bad-v", u: 0.5, v: NaN },
      { id: "good", u: 0.5, v: 0.5 },
    ];
    const result = validatePresence(baseMessage({ cursor: { anchors } }));
    expect(result?.cursor?.anchors.map((a) => a.id)).toEqual(["good"]);
  });

  it("clamps viewport u/v to [0, 1]", () => {
    const result = validatePresence(baseMessage({ cursor: { anchors: [], viewport: { u: -1, v: 2 } } }));
    expect(result?.cursor?.viewport).toEqual({ u: 0, v: 1 });
  });

  it("drops the viewport field when u or v is not a finite number", () => {
    const result = validatePresence(
      baseMessage({ cursor: { anchors: [], viewport: { u: "oops", v: 0.5 } } }),
    );
    expect(result?.cursor?.viewport).toBeUndefined();
  });

  it("treats cursor: null as a valid leave message", () => {
    const result = validatePresence(baseMessage({ cursor: null }));
    expect(result?.cursor).toBeNull();
  });

  it("drops when cursor is present but malformed", () => {
    expect(validatePresence(baseMessage({ cursor: "nope" }))).toBeNull();
    expect(validatePresence(baseMessage({ cursor: { anchors: "nope" } }))).toBeNull();
  });

  it("drops the context field when it exceeds 8 KiB JSON-encoded", () => {
    const bigContext = { blob: "x".repeat(9 * 1024) };
    const result = validatePresence(baseMessage({ context: bigContext }));
    expect(result).not.toBeNull();
    expect(result?.context).toBeUndefined();
  });

  it("keeps the context field when within 8 KiB", () => {
    const smallContext = { route: "/dashboard" };
    const result = validatePresence(baseMessage({ context: smallContext }));
    expect(result?.context).toEqual(smallContext);
  });

  it("drops the user field when it exceeds 8 KiB JSON-encoded", () => {
    const bigUser = { name: "x".repeat(9 * 1024) };
    const result = validatePresence(baseMessage({ user: bigUser }));
    expect(result).not.toBeNull();
    expect(result?.user).toBeUndefined();
  });

  it("keeps the user field when within 8 KiB", () => {
    const smallUser = { name: "Ada" };
    const result = validatePresence(baseMessage({ user: smallUser }));
    expect(result?.user).toEqual(smallUser);
  });

  function nested(depth: number): unknown {
    let value: unknown = "leaf";
    for (let i = 0; i < depth; i += 1) value = { level: i, child: value };
    return value;
  }

  function nestedArray(depth: number): unknown {
    let value: unknown = "leaf";
    for (let i = 0; i < depth; i += 1) value = [value];
    return value;
  }

  it("drops the context field when nesting exceeds the default depth of 8", () => {
    expect(validatePresence(baseMessage({ context: nested(8) }))?.context).toBeDefined();
    expect(validatePresence(baseMessage({ context: nested(9) }))?.context).toBeUndefined();
  });

  it("drops the user field when nesting exceeds the default depth of 8", () => {
    expect(validatePresence(baseMessage({ user: nested(8) }))?.user).toBeDefined();
    expect(validatePresence(baseMessage({ user: nested(9) }))?.user).toBeUndefined();
  });

  it("counts array nesting toward the depth limit", () => {
    expect(validatePresence(baseMessage({ context: nestedArray(8) }))?.context).toBeDefined();
    expect(validatePresence(baseMessage({ context: nestedArray(9) }))?.context).toBeUndefined();
  });

  it("respects an overridden maxFieldDepth", () => {
    expect(validatePresence(baseMessage({ context: nested(3) }), { maxFieldDepth: 2 })?.context).toBeUndefined();
    expect(validatePresence(baseMessage({ context: nested(2) }), { maxFieldDepth: 2 })?.context).toBeDefined();
  });

  it("drops a cyclic context field without throwing", () => {
    const cyclic: Record<string, unknown> = { self: null };
    cyclic.self = cyclic;
    const result = validatePresence(baseMessage({ context: cyclic }));
    expect(result).not.toBeNull();
    expect(result?.context).toBeUndefined();
  });

  it("uses exact UTF-8 length only when the JSON length is close to the byte limit", () => {
    const ascii = validatePresence(baseMessage({ context: "a" }), { maxFieldBytes: 3 });
    expect(ascii?.context).toBe("a");

    const multibyte = validatePresence(baseMessage({ context: "é" }), { maxFieldBytes: 3 });
    expect(multibyte?.context).toBeUndefined();
  });

  it("no longer enforces the whole-message 32 KiB limit itself (superseded by the client's wire-byte check, spec §4.2)", () => {
    const hugeCursor = {
      anchors: [{ id: "a", u: 0.5, v: 0.5 }],
      viewport: { u: 0.5, v: 0.5 },
    };
    const result = validatePresence(
      baseMessage({
        cursor: hugeCursor,
        context: { a: "x".repeat(8000) },
        user: { b: "y".repeat(8000) },
        extra: "z".repeat(20000),
      }),
    );
    expect(result).not.toBeNull();
  });

  it("never throws on garbage input", () => {
    expect(() => validatePresence(Symbol("x"))).not.toThrow();
    expect(() => validatePresence(() => {})).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => validatePresence(circular)).not.toThrow();
    expect(validatePresence(circular)).toBeNull();
  });

  it("respects overridden limits", () => {
    const result = validatePresence(baseMessage({ clientId: "abcdef" }), { maxClientIdLength: 5 });
    expect(result).toBeNull();
  });

  it("passes through a valid pointer type and drops an invalid one", () => {
    const withMouse = validatePresence(baseMessage({ pointer: { type: "mouse" } }));
    expect(withMouse?.pointer).toEqual({ type: "mouse" });

    const withBadType = validatePresence(baseMessage({ pointer: { type: "stylus" } }));
    expect(withBadType?.pointer).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { binaryCodec } from "../src/binary-codec";
import { jsonCodec } from "../src/codec";
import type { PresenceMessage } from "../src/protocol";
import { validatePresence } from "../src/validate";

// Reproduce a failure with FUZZ_SEED=<seed>; raise FUZZ_RUNS for a longer local run.
// Long runs on Node 24 can fail from a V8 JSON.parse cache bug with one-character escaped keys; Bun does not.
const SEED = Number(process.env.FUZZ_SEED ?? 0x5eed);
const RUNS = Number(process.env.FUZZ_RUNS ?? 2000);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof mulberry32>;
const int = (r: Rng, max: number) => Math.floor(r() * max);
const pick = <T>(r: Rng, items: readonly T[]): T => items[int(r, items.length)] as T;

const CHARS = ["a", "Z", "0", "-", ".", " ", "é", "中", "😀", "\u0000", '"', "\\"];
function str(r: Rng, min: number, max: number): string {
  let s = "";
  const length = min + int(r, max - min + 1);
  while (s.length < length) {
    const c = pick(r, CHARS);
    if (s.length + c.length > length) break;
    s += c;
  }
  return s.length >= min ? s : "a".repeat(min);
}

function json(r: Rng, depth = 0): unknown {
  const kind = int(r, depth > 3 ? 4 : 6);
  if (kind === 0) return null;
  if (kind === 1) return r() < 0.5;
  if (kind === 2) return Math.round((r() - 0.5) * 1e6) / 100;
  if (kind === 3) return str(r, 0, 12);
  if (kind === 4) return Array.from({ length: int(r, 4) }, () => json(r, depth + 1));
  const record: Record<string, unknown> = {};
  for (let i = int(r, 4); i > 0; i--) record[str(r, 1, 6)] = json(r, depth + 1);
  return record;
}

function presence(r: Rng): PresenceMessage {
  const message: PresenceMessage = {
    version: 1,
    clientId: str(r, 1, 40),
    session: str(r, 1, 30),
    sequence: int(r, 2 ** 31),
    cursor:
      r() < 0.2
        ? null
        : {
            anchors: Array.from({ length: int(r, 9) }, () => ({ id: str(r, 1, 20), u: r(), v: r() })),
            ...(r() < 0.5 ? { viewport: { u: r(), v: r() } } : {}),
          },
  };
  const shape = int(r, 4);
  if (shape === 0 && message.cursor === null) message.leave = true;
  else if (shape === 1 && message.cursor === null) {
    message.event = r() < 0.3 ? { type: str(r, 1, 20) } : { type: str(r, 1, 20), data: json(r) };
  } else {
    if (r() < 0.6) message.context = r() < 0.2 ? null : json(r);
    if (r() < 0.6) message.user = r() < 0.2 ? null : json(r);
    if (r() < 0.5)
      message.pointer = pick(r, [{}, { type: "mouse" }, { type: "pen" }, { type: "touch" }] as const);
  }
  return message;
}

// binary frames carry float32 coordinates
function fround(message: PresenceMessage | null): PresenceMessage | null {
  if (message?.cursor == null) return message;
  const cursor = {
    ...message.cursor,
    anchors: message.cursor.anchors.map((a) => ({ ...a, u: Math.fround(a.u), v: Math.fround(a.v) })),
  };
  if (message.cursor.viewport !== undefined) {
    cursor.viewport = {
      u: Math.fround(message.cursor.viewport.u),
      v: Math.fround(message.cursor.viewport.v),
    };
  }
  return { ...message, cursor };
}

const codecs = {
  json: { codec: jsonCodec, normalize: (message: PresenceMessage | null) => message },
  binary: { codec: binaryCodec, normalize: fround },
} as const;

describe(`codec properties (seed ${SEED}, ${RUNS} runs)`, () => {
  for (const [name, { codec, normalize }] of Object.entries(codecs)) {
    it(`${name}: a valid message survives encode, decode and validate`, () => {
      const r = mulberry32(SEED);
      for (let i = 0; i < RUNS; i++) {
        const message = presence(r);
        const expected = validatePresence(message);
        expect(expected, `run ${i}`).not.toBeNull();
        expect(validatePresence(codec.decode(codec.encode(message))), `run ${i}`).toEqual(
          normalize(expected),
        );
      }
    });

    it(`${name}: decode never throws on random, truncated, or bit-flipped bytes`, () => {
      const r = mulberry32(SEED + 1);
      for (let i = 0; i < RUNS; i++) {
        const valid = codec.encode(presence(r));
        const at = int(r, valid.byteLength);
        const flipped = valid.slice();
        flipped.set([(flipped.at(at) ?? 0) ^ (1 << int(r, 8))], at);
        const inputs = [
          Uint8Array.from({ length: int(r, 64) }, () => int(r, 256)),
          valid.subarray(0, at),
          flipped,
        ];
        for (const input of inputs) {
          expect(() => validatePresence(codec.decode(input)), `run ${i}`).not.toThrow();
        }
      }
    });
  }

  it("json and binary agree after validation", () => {
    const r = mulberry32(SEED + 2);
    for (let i = 0; i < RUNS; i++) {
      const message = presence(r);
      const viaJson = validatePresence(jsonCodec.decode(jsonCodec.encode(message)));
      const viaBinary = validatePresence(binaryCodec.decode(binaryCodec.encode(message)));
      expect(viaBinary, `run ${i}`).toEqual(fround(viaJson));
    }
  });

  it("binary decode reads a frame at a non-zero byteOffset", () => {
    const r = mulberry32(SEED + 3);
    for (let i = 0; i < 200; i++) {
      const frame = binaryCodec.encode(presence(r));
      const padded = new Uint8Array(frame.byteLength + 7);
      padded.set(frame, 3);
      expect(binaryCodec.decode(padded.subarray(3, 3 + frame.byteLength))).toEqual(binaryCodec.decode(frame));
    }
  });
});

describe("codec edge probes", () => {
  const base: PresenceMessage = { version: 1, clientId: "c", session: "s", sequence: 1, cursor: null };
  const viaJson = (message: PresenceMessage) => validatePresence(jsonCodec.decode(jsonCodec.encode(message)));
  const viaBinary = (message: PresenceMessage) =>
    validatePresence(binaryCodec.decode(binaryCodec.encode(message)));

  it("binary: refuses a finite coordinate above the float32 range", () => {
    const message = { ...base, cursor: { anchors: [{ id: "a", u: 1e39, v: 0.5 }] } };
    expect(() => binaryCodec.encode(message)).toThrow(TypeError);
  });

  it("binary: a lone surrogate in clientId becomes U+FFFD, as UTF-8 requires", () => {
    const message = { ...base, clientId: "tab-\uD800" };
    expect(viaBinary(message)?.clientId).toBe("tab-\uFFFD");
    expect(viaJson(message)?.clientId).toBe("tab-\uD800");
  });

  it("binary: refuses an event on a message with a cursor", () => {
    const message = { ...base, cursor: { anchors: [] }, event: { type: "ping", data: { x: 1 } } };
    expect(() => binaryCodec.encode(message)).toThrow("event message carries no cursor");
  });
});

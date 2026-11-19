import { type } from "arktype";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createInMemoryPair, createPresenceClient } from "../src";
import {
  eventParserFrom,
  parserFrom,
  type InferSchemaOutput,
  type StandardSchemaV1,
} from "../src/standard-schema";

const userSchemas = {
  valibot: v.object({ name: v.string(), color: v.string() }),
  zod: z.object({ name: z.string(), color: z.string() }),
  arktype: type({ name: "string", color: "string" }),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(Object.entries(userSchemas))("parserFrom with %s", (_vendor, schema) => {
  const parse = parserFrom(schema);

  it("returns the value when the schema accepts it", () => {
    expect(parse({ name: "Ada", color: "#112233" })).toEqual({ name: "Ada", color: "#112233" });
  });

  it("returns undefined when the schema rejects the value", () => {
    expect(parse({ name: 1, color: "#112233" })).toBeUndefined();
  });

  it("reports the issues to onInvalid", () => {
    const onInvalid = vi.fn();
    parserFrom(schema, { onInvalid })({ name: 1 });
    expect(onInvalid).toHaveBeenCalledOnce();
    expect(onInvalid.mock.calls[0]?.[0]).not.toHaveLength(0);
  });
});

describe("parserFrom with each vendor", () => {
  it("infers the output type of a Valibot schema", () => {
    expectTypeOf(parserFrom(userSchemas.valibot)).returns.toEqualTypeOf<
      { name: string; color: string } | undefined
    >();
  });

  it("infers the output type of a Zod schema", () => {
    expectTypeOf(parserFrom(userSchemas.zod)).returns.toEqualTypeOf<
      { name: string; color: string } | undefined
    >();
  });

  it("infers the output type of an ArkType schema", () => {
    expectTypeOf(parserFrom(userSchemas.arktype)).returns.toEqualTypeOf<
      { name: string; color: string } | undefined
    >();
  });
});

describe("parserFrom with a transforming schema", () => {
  it("returns the transformed output when a peer can parse it", () => {
    const schema = v.pipe(
      v.object({ n: v.string() }),
      v.transform((value) => ({ n: value.n.trim() })),
    );
    expect(parserFrom(schema)({ n: " 3 " })).toEqual({ n: "3" });
    expectTypeOf(parserFrom(schema)).returns.toEqualTypeOf<{ n: string } | undefined>();
  });

  it("rejects a schema whose output is not assignable to its input", () => {
    const schema = v.pipe(
      v.object({ n: v.string() }),
      v.transform((value) => ({ count: Number(value.n) })),
    );
    // @ts-expect-error a peer would parse { count: number } with a schema that expects { n: string }
    expect(parserFrom(schema)({ n: "3" })).toEqual({ count: 3 });
  });
});

describe("parserFrom with an asynchronous schema", () => {
  const asyncSchema: StandardSchemaV1<unknown, string> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => Promise.resolve({ value: String(value) }),
    },
  };

  it("drops the value and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parse = parserFrom(asyncSchema);
    expect(parse("a")).toBeUndefined();
    expect(parse("b")).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("eventParserFrom", () => {
  const parseEvent = eventParserFrom({
    chat: z.object({ text: z.string() }),
    ping: null,
  });

  it("returns an event whose data the schema accepts", () => {
    expect(parseEvent({ clientId: "p", type: "chat", data: { text: "hi" } })).toEqual({
      clientId: "p",
      type: "chat",
      data: { text: "hi" },
    });
  });

  it("drops an event whose data the schema rejects", () => {
    expect(parseEvent({ clientId: "p", type: "chat", data: { text: 1 } })).toBeUndefined();
  });

  it("drops an event with an unknown type", () => {
    expect(parseEvent({ clientId: "p", type: "other", data: {} })).toBeUndefined();
  });

  it("accepts an event without data when its schema is null", () => {
    expect(parseEvent({ clientId: "p", type: "ping", data: undefined })).toEqual({
      clientId: "p",
      type: "ping",
      data: undefined,
    });
  });

  it("types the events from the schemas", () => {
    const event = parseEvent({ clientId: "p", type: "chat", data: { text: "hi" } });
    expectTypeOf(event).toEqualTypeOf<
      | { clientId: string; type: "chat"; data: { text: string } }
      | { clientId: string; type: "ping"; data: undefined }
      | undefined
    >();
  });
});

describe("a client that uses schemas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const user = z.object({ name: z.string() });
  const context = v.object({ typingIn: v.nullable(v.string()) });

  function connect() {
    const pair = createInMemoryPair();
    const options = { parseUser: parserFrom(user), parseContext: parserFrom(context) };
    const a = createPresenceClient({ transport: pair.a, user: { name: "A" }, ...options });
    const b = createPresenceClient({ transport: pair.b, user: { name: "B" }, ...options });
    return { a, b, pair };
  }

  it("infers the user and context types from the schemas", () => {
    const { a, b, pair } = connect();
    expectTypeOf(a.getRemotePresence()[0]?.user).toEqualTypeOf<{ name: string } | undefined | null>();
    expectTypeOf(b.getRemotePresence()[0]?.context).toEqualTypeOf<
      { typingIn: string | null } | undefined | null
    >();
    a.dispose();
    b.dispose();
    pair.dispose();
  });

  it("keeps the user and context that the schemas accept", () => {
    const { a, b, pair } = connect();
    b.setContext({ typingIn: "box" });
    vi.advanceTimersByTime(1000);
    expect(a.getRemotePresence()[0]).toMatchObject({ user: { name: "B" }, context: { typingIn: "box" } });
    a.dispose();
    b.dispose();
    pair.dispose();
  });
});

describe("types without a schema", () => {
  it("leaves user and context unknown", () => {
    const pair = createInMemoryPair();
    const client = createPresenceClient({ transport: pair.a });
    expectTypeOf(client.getRemotePresence()[0]?.user).toEqualTypeOf<unknown>();
    expectTypeOf(client.getRemotePresence()[0]?.context).toEqualTypeOf<unknown>();
    client.dispose();
    pair.dispose();
  });

  it("infers the output type of a schema", () => {
    expectTypeOf<InferSchemaOutput<typeof userSchemas.zod>>().toEqualTypeOf<{
      name: string;
      color: string;
    }>();
  });
});

describe("the standard-schema entry point", () => {
  it("exposes only parserFrom and eventParserFrom at runtime", async () => {
    const mod = await import("../src/standard-schema");
    expect(Object.keys(mod).toSorted()).toEqual(["eventParserFrom", "parserFrom"]);
  });

  it("stays out of the root entry", async () => {
    const root = await import("../src");
    expect("parserFrom" in root).toBe(false);
    expect("eventParserFrom" in root).toBe(false);
  });
});

describe("eventParserFrom with a transforming schema", () => {
  const transforming = v.pipe(
    v.object({ n: v.string() }),
    v.transform((value) => ({ count: Number(value.n) })),
  );

  it("rejects a schema whose output is not a valid input", () => {
    // @ts-expect-error a peer parses what the sender's output sent, so the output must fit the input
    expect(eventParserFrom({ count: transforming })).toBeTypeOf("function");
  });
});

describe("parserFrom with a schema whose declared output differs from its validate result", () => {
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: (value: unknown) => ({ value }),
      types: { input: { name: "" }, output: { name: "" } },
    },
  };

  it("rejects the schema", () => {
    // @ts-expect-error the validate result must be assignable to the declared output
    expect(parserFrom(schema)).toBeTypeOf("function");
  });
});

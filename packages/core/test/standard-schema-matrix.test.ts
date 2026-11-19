import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parserFrom } from "../src/standard-schema";

type Tree = { name: string; children: Tree[] };

describe("parserFrom accepts the usual Valibot schemas", () => {
  const schemas = [
    parserFrom(
      v.object({ a: v.optional(v.string()), b: v.nullable(v.number()), c: v.optional(v.string(), "x") }),
    ),
    parserFrom(v.picklist(["a", "b"])),
    parserFrom(v.union([v.string(), v.number()])),
    parserFrom(
      v.variant("t", [v.object({ t: v.literal("a"), x: v.string() }), v.object({ t: v.literal("b") })]),
    ),
    parserFrom(v.record(v.string(), v.number())),
    parserFrom(v.tuple([v.string(), v.number()])),
    parserFrom(v.pipe(v.object({ xs: v.array(v.string()) }), v.readonly())),
    parserFrom(v.pipe(v.string(), v.brand("UserId"))),
    parserFrom(v.looseObject({ a: v.string() })),
    parserFrom(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
    parserFrom(
      v.object({
        name: v.string(),
        children: v.array(
          v.lazy((): v.GenericSchema<Tree> => v.object({ name: v.string(), children: v.array(v.any()) })),
        ),
      }),
    ),
  ];

  it("builds a parser for each", () => {
    for (const parse of schemas) expect(parse).toBeTypeOf("function");
  });
});

describe("parserFrom accepts the usual Zod schemas", () => {
  const schemas = [
    parserFrom(z.object({ a: z.string().optional(), b: z.number().nullable(), c: z.string().default("x") })),
    parserFrom(z.enum(["a", "b"])),
    parserFrom(z.union([z.string(), z.number()])),
    parserFrom(
      z.discriminatedUnion("t", [
        z.object({ t: z.literal("a"), x: z.string() }),
        z.object({ t: z.literal("b") }),
      ]),
    ),
    parserFrom(z.record(z.string(), z.number())),
    parserFrom(z.tuple([z.string(), z.number()])),
    parserFrom(z.object({ xs: z.array(z.string()) }).readonly()),
    parserFrom(z.string().brand<"UserId">()),
    parserFrom(z.looseObject({ a: z.string() })),
    parserFrom(z.string().min(1).max(40)),
    parserFrom(z.object({ name: z.string(), age: z.number().int().optional() })),
  ];

  it("builds a parser for each", () => {
    for (const parse of schemas) expect(parse).toBeTypeOf("function");
  });
});

describe("parserFrom accepts the usual ArkType schemas", () => {
  const schemas = [
    parserFrom(type({ a: "string?", b: "number | null" })),
    parserFrom(type("'a' | 'b'")),
    parserFrom(type("string | number")),
    parserFrom(type({ t: "'a'", x: "string" }).or({ t: "'b'" })),
    parserFrom(type("Record<string, number>")),
    parserFrom(type(["string", "number"])),
    parserFrom(type({ xs: "string[]" })),
    parserFrom(type({ name: "string", "age?": "number.integer" })),
    parserFrom(type("string > 0")),
  ];

  it("builds a parser for each", () => {
    for (const parse of schemas) expect(parse).toBeTypeOf("function");
  });
});

describe("parserFrom with defaults", () => {
  it("parses a default key to its output", () => {
    expect(parserFrom(z.object({ c: z.string().default("x") }))({})).toEqual({ c: "x" });
    expect(parserFrom(v.object({ c: v.optional(v.string(), "x") }))({})).toEqual({ c: "x" });
  });
});

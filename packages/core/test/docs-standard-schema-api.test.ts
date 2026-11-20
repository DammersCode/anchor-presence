import { describe, expect, expectTypeOf, it } from "vitest";
import type { EventParser } from "../src";
import { eventParserFrom, parserFrom } from "../src/standard-schema";
import type {
  EventsFromSchemas as ExportedEventsFromSchemas,
  InferSchemaOutput as ExportedInferSchemaOutput,
  SchemaParser as ExportedSchemaParser,
  SchemaParserOptions,
  StandardSchemaV1,
} from "../src/standard-schema";
import { docSample, readRepoFile } from "../../react/test/doc-source";

const squash = (text: string) => text.replaceAll(/\s+/gu, "");

// Verbatim copies of the signature blocks in core/api/standard-schema.mdx; the last test checks each copy against the page.

namespace Listing {
  export type SchemaParser<Schema extends StandardSchemaV1> = (
    value: unknown,
  ) => InferSchemaOutput<Schema> | undefined;

  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  export declare function parserFrom<Schema extends StandardSchemaV1>(
    schema: Schema,
    options?: SchemaParserOptions,
  ): SchemaParser<Schema>;

  export type EventSchemas = Record<string, StandardSchemaV1 | null>;

  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  export declare function eventParserFrom<Schemas extends EventSchemas>(
    schemas: Schemas,
    options?: SchemaParserOptions,
  ): EventParser<EventsFromSchemas<Schemas>>;

  export type InferSchemaOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];

  export type EventsFromSchemas<Schemas extends EventSchemas> = {
    [Type in keyof Schemas]: Schemas[Type] extends StandardSchemaV1
      ? InferSchemaOutput<Schemas[Type]>
      : undefined;
  };
}

type Text = StandardSchemaV1<unknown, string>;

describe("api/standard-schema.mdx listing", () => {
  it("equals the exported types", () => {
    expectTypeOf<Listing.InferSchemaOutput<Text>>().toEqualTypeOf<ExportedInferSchemaOutput<Text>>();
    expectTypeOf<Listing.SchemaParser<Text>>().toEqualTypeOf<ExportedSchemaParser<Text>>();
    expectTypeOf<Listing.EventsFromSchemas<{ chat: Text; wave: null }>>().toEqualTypeOf<
      ExportedEventsFromSchemas<{ chat: Text; wave: null }>
    >();
  });

  it("names the exported functions", () => {
    expect(parserFrom).toBeTypeOf("function");
    expect(eventParserFrom).toBeTypeOf("function");
  });
});

describe("api/standard-schema.mdx samples", () => {
  it("match the page", () => {
    const lines = readRepoFile("packages/core/test/docs-standard-schema-api.test.ts").split("\n");
    const source = squash(lines.filter((line) => !line.includes("oxlint-disable")).join("\n")).replaceAll(
      /export(declare)?/gu,
      "",
    );
    const samples = [
      docSample("core/api/standard-schema.mdx", "type SchemaParser"),
      docSample("core/api/standard-schema.mdx", "type InferSchemaOutput"),
    ];
    for (const sample of samples) expect(source).toContain(squash(sample));
  });
});

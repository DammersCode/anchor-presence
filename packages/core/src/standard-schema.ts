import { createEventParser } from "./event-channel.js";
import type { EventParser, EventParsers } from "./event-channel.js";

/** The Standard Schema interface (v1) that Valibot, Zod, ArkType, and other libraries implement. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: { readonly input: Input; readonly output: Output } | undefined;
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** The output type of a Standard Schema. */
export type InferSchemaOutput<Schema extends StandardSchemaV1> = NonNullable<
  Schema["~standard"]["types"]
>["output"];

/** The input type of a Standard Schema. */
export type InferSchemaInput<Schema extends StandardSchemaV1> = NonNullable<
  Schema["~standard"]["types"]
>["input"];

/** Resolves to `unknown` when a peer can parse what the schema outputs. */
export type SchemaRoundTrip<Schema extends StandardSchemaV1> = [InferSchemaOutput<Schema>] extends [
  InferSchemaInput<Schema>,
]
  ? unknown
  : { readonly "the schema output must be assignable to its input": never };

/** A parser that fits `parseUser`, `parseContext`, and the data parsers of `createEventParser`. */
export type SchemaParser<Schema extends StandardSchemaV1> = (
  value: unknown,
) => InferSchemaOutput<Schema> | undefined;

export type SchemaParserOptions = {
  /** Called with the issues when the schema rejects a value. The client then drops that field or event. */
  onInvalid?: ((issues: ReadonlyArray<StandardSchemaIssue>, value: unknown) => void) | undefined;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/**
 * Turns a Standard Schema into a synchronous parser for `parseUser`, `parseContext`, or one event type.
 * The parser returns `undefined` when the schema rejects the value, and when the schema validates asynchronously.
 */
export function parserFrom<Schema extends StandardSchemaV1>(
  schema: Schema & SchemaRoundTrip<Schema> & StandardSchemaV1<unknown, InferSchemaOutput<Schema>>,
  options: SchemaParserOptions = {},
): SchemaParser<Schema> {
  let warnedAsync = false;
  return (value) => {
    const result = schema["~standard"].validate(value);
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => {});
      if (!warnedAsync) {
        warnedAsync = true;
        console.warn(
          "[anchor-presence] parserFrom: the schema validates asynchronously, so every value is dropped. Use a synchronous schema.",
        );
      }
      return;
    }
    if (result.issues !== undefined) {
      options.onInvalid?.(result.issues, value);
      return;
    }
    return result.value;
  };
}

export type EventSchemas = Record<string, StandardSchemaV1 | null>;

/** The event map that a set of event schemas describes. A `null` schema stands for an event without data. */
export type EventsFromSchemas<Schemas extends EventSchemas> = {
  [Type in keyof Schemas]: Schemas[Type] extends StandardSchemaV1
    ? InferSchemaOutput<Schemas[Type]>
    : undefined;
};

/**
 * Builds a `parseEvent` option from one Standard Schema per event type.
 * The client drops an event with an unknown type or data that its schema rejects.
 */
export function eventParserFrom<Schemas extends EventSchemas>(
  schemas: Schemas & {
    [Type in keyof Schemas]: Schemas[Type] extends StandardSchemaV1
      ? SchemaRoundTrip<Schemas[Type]> & StandardSchemaV1<unknown, InferSchemaOutput<Schemas[Type]>>
      : unknown;
  },
  options: SchemaParserOptions = {},
): EventParser<EventsFromSchemas<Schemas>> {
  const parsers: Record<string, SchemaParser<StandardSchemaV1> | null> = {};
  for (const [type, schema] of Object.entries(schemas)) {
    parsers[type] = schema === null ? null : parserFrom(schema, options);
  }
  return createEventParser(parsers as EventParsers<EventsFromSchemas<Schemas>>);
}

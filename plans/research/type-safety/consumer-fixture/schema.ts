// The standard-schema entry point resolves under both module resolutions and infers from a schema.
import { createInMemoryPair, createPresenceClient, type PresenceClient } from "@dammers/anchor-presence-core";
import {
  eventParserFrom,
  parserFrom,
  type StandardSchemaV1,
} from "@dammers/anchor-presence-core/standard-schema";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
declare function assertEqual<A, B>(ok: Equal<A, B>): void;

const userSchema: StandardSchemaV1<unknown, { name: string }> = {
  "~standard": {
    version: 1,
    vendor: "fixture",
    validate: (value) =>
      typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
        ? { value: { name: value.name } }
        : { issues: [{ message: "name must be a string" }] },
  },
};

const pair = createInMemoryPair();
const client = createPresenceClient({ transport: pair.a, parseUser: parserFrom(userSchema) });
assertEqual<PresenceClient<unknown, { name: string }>, typeof client>(true);

const parseEvent = eventParserFrom({ ping: null, hello: userSchema });
const event = parseEvent({ clientId: "p", type: "hello", data: { name: "Ada" } });
assertEqual<typeof event extends undefined ? never : NonNullable<typeof event>["type"], "ping" | "hello">(
  true,
);

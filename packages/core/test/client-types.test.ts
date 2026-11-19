import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createEventChannel,
  createEventParser,
  createInMemoryPair,
  createPresenceClient,
  validatePresence,
} from "../src";
import type { PresenceClient, PresenceMessage, TypedRemoteEvent } from "../src";

type User = { name: string };
type Context = { page: string };

const parseUser = (value: unknown): User | undefined =>
  typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
    ? { name: value.name }
    : undefined;
const parseContext = (value: unknown): Context | undefined =>
  typeof value === "object" && value !== null && "page" in value && typeof value.page === "string"
    ? { page: value.page }
    : undefined;

type Events = { reaction: { emoji: string }; ping: undefined };
type WrongEvents = { reaction: { emoji: number } };

const parseEvent = createEventParser<Events>({
  reaction: (data) =>
    typeof data === "object" && data !== null && "emoji" in data && typeof data.emoji === "string"
      ? { emoji: data.emoji }
      : undefined,
  ping: null,
});

const { a: transport } = createInMemoryPair();

describe("createPresenceClient types", () => {
  it("leaves user and context unknown without parsers", () => {
    const client = createPresenceClient({ transport, user: { name: "Ada" }, context: { page: "home" } });
    const remote = client.getRemotePresence()[0];
    expectTypeOf(remote?.user).toEqualTypeOf<unknown>();
    expectTypeOf(remote?.context).toEqualTypeOf<unknown>();
    client.dispose();
  });

  it("infers user and context from the parsers", () => {
    const client = createPresenceClient({
      transport,
      user: { name: "Ada" },
      context: { page: "home" },
      parseUser,
      parseContext,
    });
    const remote = client.getRemotePresence()[0];
    expectTypeOf(remote?.user).toEqualTypeOf<User | null | undefined>();
    expectTypeOf(remote?.context).toEqualTypeOf<Context | null | undefined>();
    client.dispose();
  });

  it("accepts explicit types that match their parsers", () => {
    const client = createPresenceClient<Context, User>({ transport, parseUser, parseContext });
    expect(client.clientId).toBeTypeOf("string");
    client.dispose();
  });

  it("rejects types that the code claims without a parser", () => {
    // @ts-expect-error parseUser is required for a user type
    expect(createPresenceClient<unknown, { name: string }>({ transport })).toBeDefined();
  });

  it("rejects a user of the wrong type for the parser", () => {
    // @ts-expect-error the user must have the output type of parseUser
    expect(createPresenceClient({ transport, user: { name: 1 }, parseUser })).toBeDefined();
  });

  it("rejects an explicit type that disagrees with its parser", () => {
    // @ts-expect-error the parser returns User, not { id: number }
    expect(createPresenceClient<unknown, { id: number }>({ transport, parseUser })).toBeDefined();
  });

  it("types the events from parseEvent", () => {
    const client = createPresenceClient({ transport, parseEvent });
    expectTypeOf(client).toEqualTypeOf<PresenceClient<unknown, unknown, Events>>();
    client.subscribeEvents((event) => expectTypeOf(event).toEqualTypeOf<TypedRemoteEvent<Events>>());
    const channel = createEventChannel(client);
    channel.subscribe((event) => expectTypeOf(event).toEqualTypeOf<TypedRemoteEvent<Events>>());
    client.dispose();
  });

  it("leaves event data unknown without parseEvent", () => {
    const client = createPresenceClient({ transport });
    client.subscribeEvents((event) => expectTypeOf(event.data).toEqualTypeOf<unknown>());
    client.dispose();
  });

  it("rejects an event map without parseEvent", () => {
    // @ts-expect-error parseEvent is required for an event map
    expect(createPresenceClient<unknown, unknown, Events>({ transport })).toBeDefined();
  });

  it("rejects a channel type that disagrees with the client", () => {
    const client = createPresenceClient({ transport, parseEvent });
    // @ts-expect-error the client delivers Events, not WrongEvents
    expect(createEventChannel<WrongEvents>(client)).toBeDefined();
    client.dispose();
  });

  it("returns validatePresence output without user and context types", () => {
    const message = validatePresence({});
    expectTypeOf(message).toEqualTypeOf<PresenceMessage | null>();
    // @ts-expect-error without a parser the user and context stay unknown
    const typed: PresenceMessage<Context, User> | null = message;
    expect(typed).toBeNull();
  });
});

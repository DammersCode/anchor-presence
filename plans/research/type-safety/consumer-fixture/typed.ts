// Inference from parsers and from type arguments, with negatives.
import {
  createEventChannel,
  createEventParser,
  createPresenceClient,
  createInMemoryPair,
  type PresenceClient,
} from "@anchor-presence/core";
import { createPresenceHooks, PresenceProvider, type RemoteUser } from "@anchor-presence/react";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
declare function assertEqual<A, B>(ok: Equal<A, B>): void;

type User = { name: string };
type Ctx = { page: string };
type Events = { ping: undefined; reaction: { emoji: string } };

const parseUser = (v: unknown): User | undefined =>
  typeof v === "object" && v !== null && "name" in v && typeof v.name === "string"
    ? { name: v.name }
    : undefined;
const parseContext = (v: unknown): Ctx | undefined =>
  typeof v === "object" && v !== null && "page" in v && typeof v.page === "string"
    ? { page: v.page }
    : undefined;

const pair = createInMemoryPair();

// inferred from parsers
const inferred = createPresenceClient({ transport: pair.a, parseUser, parseContext });
assertEqual<PresenceClient<Ctx, User>, typeof inferred>(true);

// inferred from local values
const fromValues = createPresenceClient({ transport: pair.a, user: { name: "a" }, context: { page: "x" } });
assertEqual<PresenceClient<{ page: string }, { name: string }>, typeof fromValues>(true);

// explicit type arguments
const explicit = createPresenceClient<Ctx, User>({ transport: pair.a });
assertEqual<PresenceClient<Ctx, User>, typeof explicit>(true);

// @ts-expect-error user must match the type argument
createPresenceClient<Ctx, User>({ transport: pair.a, user: { name: 1 } });
// @ts-expect-error parser result must match the type argument
createPresenceClient<Ctx, User>({ transport: pair.a, parseUser: (_v: unknown) => 1 });

// events
const parseEvent = createEventParser<Events>({
  ping: null,
  reaction: (data) =>
    typeof data === "object" && data !== null && "emoji" in data && typeof data.emoji === "string"
      ? { emoji: data.emoji }
      : undefined,
});
const channel = createEventChannel<Events>(inferred);
channel.send("ping");
channel.send("reaction", { emoji: "x" });
channel.subscribe((event) => {
  if (event.type === "reaction") assertEqual<{ emoji: string }, typeof event.data>(true);
});
// @ts-expect-error unknown event type
channel.send("nope");
// @ts-expect-error wrong data type
channel.send("reaction", { emoji: 3 });
// @ts-expect-error reaction needs data
channel.send("reaction");
// @ts-expect-error a parser is required for each event type
createEventParser<Events>({ ping: null });
// @ts-expect-error null is only for events without data
createEventParser<Events>({ ping: null, reaction: null });
void parseEvent;

// typed hooks and provider
const hooks = createPresenceHooks<Ctx, User, Events>();
const [user] = hooks.useLocalUser();
assertEqual<User | undefined, typeof user>(true);
const [context] = hooks.useLocalContext();
assertEqual<Ctx | undefined, typeof context>(true);
assertEqual<RemoteUser<User>[], ReturnType<typeof hooks.useRemoteUsers>>(true);
assertEqual<User, ReturnType<typeof hooks.useRemoteCursors>[number]["user"] & User>(true);
hooks.useRemoteEvents((event) => {
  if (event.type === "reaction") assertEqual<{ emoji: string }, typeof event.data>(true);
});
hooks.PresenceProvider({ client: inferred });
// @ts-expect-error provider client must match the hook generics
hooks.PresenceProvider({ client: createPresenceClient<{ other: 1 }, User>({ transport: pair.a }) });
// @ts-expect-error send rejects unknown events
hooks.useSendEvent()("nope");

PresenceProvider({ client: inferred });

const [, setUser] = hooks.useLocalUser();
// @ts-expect-error the setter takes User, not a string
setUser("name");

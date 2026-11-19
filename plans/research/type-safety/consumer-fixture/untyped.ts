// No type arguments anywhere: user and context must be unknown, and an expect-error line must be checked.
import {
  createEventChannel,
  createPresenceClient,
  createInMemoryPair,
  type PresenceClient,
} from "@anchor-presence/core";
import {
  createPresenceHooks,
  PresenceProvider,
  useLocalContext,
  useLocalUser,
  useRemoteCursors,
  useRemoteUsers,
} from "@anchor-presence/react";
import { createDomBinding } from "@anchor-presence/dom";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
declare function expectTrue<T extends true>(): T;
declare function expectFalse<T extends false>(): T;

const pair = createInMemoryPair();
const client = createPresenceClient({ transport: pair.a });
const [user] = useLocalUser();
const [context] = useLocalContext();
const users = useRemoteUsers();
const cursors = useRemoteCursors();

expectFalse<IsAny<typeof user>>();
expectFalse<IsAny<typeof context>>();
expectTrue<typeof client extends PresenceClient<unknown, unknown> ? true : false>();
expectFalse<IsAny<(typeof cursors)[number]["user"]>>();
expectFalse<IsAny<(typeof cursors)[number]["context"]>>();

// unknown must be narrowed before use
// @ts-expect-error user is unknown without a type argument
user.name;
// @ts-expect-error context is unknown without a type argument
context.id;

const channel = createEventChannel(client);
channel.send("any-event", { anything: 1 });
channel.subscribe((event) => {
  expectFalse<IsAny<typeof event.data>>();
  // @ts-expect-error event data is unknown without a type argument
  event.data.x;
});

createDomBinding(client);
PresenceProvider({ client });
createPresenceHooks();

expectTrue<Equal<typeof user, unknown>>();
expectTrue<Equal<typeof context, unknown>>();
expectTrue<Equal<(typeof users)[number]["user"], unknown>>();
expectTrue<Equal<(typeof cursors)[number]["user"], unknown>>();
expectTrue<Equal<(typeof cursors)[number]["context"], unknown>>();

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import type {
  EventChannel,
  EventMap,
  PeerChange,
  PresenceClient,
  RemotePresence,
  TypedRemoteEvent,
} from "@anchor-presence/core";
import type { DomBinding, ResolvedCursor } from "@anchor-presence/dom";
import {
  CursorLayer,
  PresenceProvider,
  createPresenceHooks,
  useDomBinding,
  useLocalContext,
  useLocalUser,
  usePeerChanges,
  usePresenceClient,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteEvents,
  useRemotePresence,
  useRemoteUsers,
  useSendEvent,
} from "../src/index";
import type { CursorLayerProps, RemoteUser } from "../src/index";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

type Ctx = { page: string };
type User = { name: string };
type Events = { ping: { n: number } };

const typed = createPresenceHooks<Ctx, User, Events>();

declare const matching: PresenceClient<Ctx, User, Events>;
declare const otherContext: PresenceClient<{ other: number }, User, Events>;
declare const otherUser: PresenceClient<Ctx, { other: number }, Events>;
declare const otherEvents: PresenceClient<Ctx, User, { other: { n: number } }>;
declare const userOnly: PresenceClient<unknown, User>;

describe("hooks from @anchor-presence/react", () => {
  it("return unknown and take no type argument", () => {
    expectTypeOf(useRemoteUsers).returns.toEqualTypeOf<readonly RemoteUser<unknown>[]>();
    expectTypeOf(useLocalUser).returns.toEqualTypeOf<[unknown, (next: unknown) => void]>();
    expectTypeOf(useLocalContext).returns.toEqualTypeOf<[unknown, (next: unknown) => void]>();
    expectTypeOf(useRemotePresence).returns.toEqualTypeOf<readonly RemotePresence<unknown, unknown>[]>();
    expectTypeOf(useRemoteCursors).returns.toEqualTypeOf<readonly ResolvedCursor<unknown, unknown>[]>();
    expectTypeOf(usePresenceClient).returns.toEqualTypeOf<PresenceClient | null>();
    expectTypeOf(useDomBinding).returns.toEqualTypeOf<DomBinding | null>();
    expectTypeOf(useSendEvent).returns.toEqualTypeOf<EventChannel<EventMap>["send"]>();
    expectTypeOf(useRemoteEvents).parameter(0).toEqualTypeOf<(event: TypedRemoteEvent<EventMap>) => void>();
    expectTypeOf(usePeerChanges).parameter(0).toEqualTypeOf<(change: PeerChange) => void>();
    expectTypeOf(useRemoteCursorsSelector<number>)
      .parameter(0)
      .toEqualTypeOf<(cursors: readonly ResolvedCursor[]) => number>();
  });

  it("reject a type argument that no client proves", () => {
    function Claims() {
      // @ts-expect-error a hook from the package takes no type argument
      useRemoteUsers<User>();
      return null;
    }
    expect(Claims).toBeTypeOf("function");
  });

  it("reject a render prop that claims a user type", () => {
    function Claims() {
      // @ts-expect-error the callback claims a user type that the layer cannot prove
      return <CursorLayer getLabel={(cursor: ResolvedCursor<unknown, User>) => cursor.user?.name} />;
    }
    expect(Claims).toBeTypeOf("function");
  });

  it("take only an untyped client in the provider, so the shared context cannot hold a typed one", () => {
    function Tree() {
      return (
        // @ts-expect-error a client with a user type does not fit the untyped provider
        <PresenceProvider client={userOnly}>
          <CursorLayer />
        </PresenceProvider>
      );
    }
    function FactoryTree() {
      // @ts-expect-error a client with every type does not fit the untyped provider
      return <PresenceProvider factory={() => matching} />;
    }
    expect([Tree, FactoryTree]).toHaveLength(2);
  });

  it("take an unknown-typed client that has parsers", () => {
    const client = createPresenceClient<unknown, unknown>({
      transport: createInMemoryPair().a,
      parseUser: (value) => value,
    });
    function Tree() {
      return <PresenceProvider client={client} />;
    }
    expect(Tree).toBeTypeOf("function");
    client.dispose();
  });
});

describe("hooks from createPresenceHooks", () => {
  it("return the types of the factory call", () => {
    expectTypeOf(typed.useRemoteUsers).returns.toEqualTypeOf<readonly RemoteUser<User>[]>();
    expectTypeOf(typed.useLocalUser).returns.toEqualTypeOf<
      [User | undefined, (next: User | undefined) => void]
    >();
    expectTypeOf(typed.useLocalContext).returns.toEqualTypeOf<
      [Ctx | undefined, (next: Ctx | undefined) => void]
    >();
    expectTypeOf(typed.useRemotePresence).returns.toEqualTypeOf<readonly RemotePresence<Ctx, User>[]>();
    expectTypeOf(typed.useRemoteCursors).returns.toEqualTypeOf<readonly ResolvedCursor<Ctx, User>[]>();
    expectTypeOf(typed.usePresenceClient).returns.toEqualTypeOf<PresenceClient<Ctx, User, Events> | null>();
    expectTypeOf(typed.useSendEvent).returns.toEqualTypeOf<EventChannel<Events>["send"]>();
    expectTypeOf(typed.useRemoteEvents)
      .parameter(0)
      .toEqualTypeOf<(event: TypedRemoteEvent<Events>) => void>();
    expectTypeOf(typed.CursorLayer).parameter(0).toEqualTypeOf<CursorLayerProps<Ctx, User>>();
  });

  it("accept a client of the same types", () => {
    function Tree() {
      return <typed.PresenceProvider client={matching} />;
    }
    expect(Tree).toBeTypeOf("function");
  });

  it("reject a client with another context type", () => {
    function Tree() {
      // @ts-expect-error only the context type differs
      return <typed.PresenceProvider client={otherContext} />;
    }
    expect(Tree).toBeTypeOf("function");
  });

  it("reject a client with another user type", () => {
    function Tree() {
      // @ts-expect-error only the user type differs
      return <typed.PresenceProvider client={otherUser} />;
    }
    expect(Tree).toBeTypeOf("function");
  });

  it("reject a client with another event map", () => {
    function Tree() {
      // @ts-expect-error only the event map differs
      return <typed.PresenceProvider client={otherEvents} />;
    }
    expect(Tree).toBeTypeOf("function");
  });

  it("reject a type argument on a hook of the result", () => {
    function Claims() {
      // @ts-expect-error the hook takes no type argument
      typed.useRemoteUsers<{ id: number }>();
      return null;
    }
    expect(Claims).toBeTypeOf("function");
  });

  it("reject a field that the user type does not have", () => {
    function Claims() {
      // @ts-expect-error User has no age field
      return typed.useRemoteUsers()[0]?.user?.age;
    }
    expect(Claims).toBeTypeOf("function");
  });
});

describe("the context of createPresenceHooks", () => {
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root !== null) act(() => root?.unmount());
    root = null;
  });

  function mount(node: React.ReactNode): void {
    root = createRoot(document.createElement("div"));
    act(() => root?.render(node));
  }

  it("is empty for a hook of the result under the package provider", () => {
    const { client } = makeFakeClient();
    const seen: unknown[] = [];
    const { binding } = makeFakeBinding();
    function Probe() {
      seen.push(typed.usePresenceClient());
      return null;
    }
    mount(
      <PresenceProvider client={client} binding={binding}>
        <Probe />
      </PresenceProvider>,
    );
    expect(seen.at(-1)).toBeNull();
  });

  it("is empty for a hook of the package under the provider of the result", () => {
    const { client } = makeFakeClient<Ctx, User, Events>();
    const { binding } = makeFakeBinding<Ctx, User>();
    const seen: unknown[] = [];
    function Probe() {
      seen.push(usePresenceClient(), typed.usePresenceClient());
      return null;
    }
    mount(
      <typed.PresenceProvider client={client} binding={binding}>
        <Probe />
      </typed.PresenceProvider>,
    );
    expect(seen.at(-2)).toBeNull();
    expect(seen.at(-1)).toBe(client);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createEventChannel,
  createEventParser,
  createInMemoryPair,
  createPresenceClient,
  type EventChannel,
  type EventMap,
  type PeerChange,
  type PresenceClient,
  type RemoteEvent,
} from "@anchor-presence/core";
import {
  createPresenceHooks,
  LiveCursorProvider as PlainProvider,
  useLocalUser,
  usePeerChanges,
  type useSendEvent as exportedUseSendEvent,
} from "../src/index";
import type { useLocalUser as exportedUseLocalUser } from "../src/hooks/use-local-user";
import type { usePeerChanges as exportedUsePeerChanges } from "../src/hooks/use-peer-changes";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { makeFakeBinding } from "./test-utils";

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

// presence.ts

export type User = { name: string; color: string };
export type Context = { pageId: string };
export type Events = { reaction: { emoji: string }; ping: undefined };

export const {
  LiveCursorProvider,
  useCursorClient,
  useLocalContext,
  useCursorEvents,
  useLocalUser: useTypedLocalUser,
  useRemoteCursors,
  useRemoteUsers,
  useSendEvent,
} = createPresenceHooks<Context, User, Events>();

function Reactions() {
  const sendEvent = useSendEvent();
  const [lastEmoji, setLastEmoji] = useState<string | null>(null);

  useCursorEvents((event) => {
    if (event.type === "reaction") setLastEmoji(event.data.emoji);
  });

  return (
    <div>
      <button type="button" onClick={() => sendEvent("reaction", { emoji: "tada" })}>
        React
      </button>
      {lastEmoji !== null && <p role="status">{lastEmoji}</p>}
    </div>
  );
}

const parseEvent = createEventParser<Events>({
  reaction: (data) => {
    const emoji = (data as { emoji?: unknown } | undefined)?.emoji;
    return typeof emoji === "string" ? { emoji } : undefined;
  },
  ping: null,
});

function App() {
  return (
    <LiveCursorProvider
      factory={() => createPresenceClient({ transport: createWebSocketTransport(), parseEvent })}
    >
      <Reactions />
    </LiveCursorProvider>
  );
}

function JoinNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  usePeerChanges((change) => {
    if (change.type === "join") setNotice(`${change.clientId} joined`);
  });
  return notice !== null ? <p role="status">{notice}</p> : null;
}

type MyUser = { name: string; color: string };

function NameField() {
  const [user, setUser] = useLocalUser<MyUser>();
  return (
    <input
      aria-label="Your name"
      value={user?.name ?? ""}
      onChange={(event) => setUser({ name: event.target.value, color: user?.color ?? "#6366f1" })}
    />
  );
}

declare namespace Listing {
  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  function useLocalUser<TUser = unknown>(): [TUser | undefined, (next: TUser | undefined) => void];

  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  function usePeerChanges<TContext = unknown, TUser = unknown>(
    listener: (change: PeerChange<TContext, TUser>) => void,
  ): void;

  // oxlint-disable-next-line eslint/no-shadow, typescript/no-unnecessary-type-parameters -- the listing copies the export
  function useSendEvent<TEvents extends object = EventMap>(): EventChannel<TEvents>["send"];
}

let container: HTMLDivElement;
let root: Root;
const clients: PresenceClient<unknown, unknown>[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});

function connectedPair<TUser, TContext = unknown>(user?: TUser) {
  const { a, b } = createInMemoryPair();
  const local = createPresenceClient<TContext, TUser>({
    transport: a,
    clientId: "local",
    ...(user === undefined ? {} : { user }),
  });
  const peer = createPresenceClient({ transport: b, clientId: "peer" });
  clients.push(local as PresenceClient<unknown, unknown>, peer);
  return { local, peer };
}

describe("typed-hooks.mdx: typed events", () => {
  it("shows a typed reaction from a peer and sends one on click", () => {
    const { local, peer } = connectedPair<User, Context>();
    const peerEvents: RemoteEvent[] = [];
    peer.subscribeEvents((event) => peerEvents.push(event));
    act(() =>
      root.render(
        <LiveCursorProvider client={local} binding={makeFakeBinding<Context, User>().binding}>
          <Reactions />
        </LiveCursorProvider>,
      ),
    );

    act(() => {
      createEventChannel<Events>(peer).send("reaction", { emoji: "wave" });
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("wave");

    act(() => container.querySelector("button")?.click());
    expect(peerEvents).toEqual([{ clientId: "local", type: "reaction", data: { emoji: "tada" } }]);
    expectTypeOf(useTypedLocalUser).returns.toEqualTypeOf<
      [User | undefined, (next: User | undefined) => void]
    >();
  });
});

describe("typed-hooks.mdx: parseEvent", () => {
  it("keeps a valid reaction and drops other data", () => {
    expect(parseEvent({ clientId: "a", type: "reaction", data: { emoji: "tada" } })).toEqual({
      clientId: "a",
      type: "reaction",
      data: { emoji: "tada" },
    });
    expect(parseEvent({ clientId: "a", type: "reaction", data: { emoji: 3 } })).toBeUndefined();
    expect(parseEvent({ clientId: "a", type: "ping", data: 1 })).toBeUndefined();
    expect(App).toBeTypeOf("function");
  });
});

describe("remote-users.mdx: peer changes", () => {
  it("shows the peer that joined", () => {
    const { local, peer } = connectedPair();
    act(() =>
      root.render(
        <PlainProvider client={local} binding={makeFakeBinding().binding}>
          <JoinNotice />
        </PlainProvider>,
      ),
    );
    expect(container.textContent).toBe("");

    act(() => {
      peer.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("peer joined");
  });
});

describe("local-context.mdx: local user", () => {
  it("shows the local user and sends a typed name to the client", () => {
    const { local } = connectedPair<MyUser>({ name: "Ada", color: "#000000" });
    act(() =>
      root.render(
        <PlainProvider client={local} binding={makeFakeBinding().binding}>
          <NameField />
        </PlainProvider>,
      ),
    );
    const input = container.querySelector("input");
    expect(input?.value).toBe("Ada");

    const valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    act(() => {
      // React tracks the value through the prototype setter, so an own assignment does not fire onChange
      valueProperty?.set?.call(input, "Bo");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(local.getUser()).toEqual({ name: "Bo", color: "#000000" });
    expect(input?.value).toBe("Bo");

    act(() => local.setUser({ name: "Cy", color: "#000000" }));
    expect(input?.value).toBe("Cy");
  });
});

describe("api/hooks.mdx: hook listings", () => {
  it("equal the exported signatures", () => {
    expectTypeOf<ReturnType<typeof Listing.useLocalUser<MyUser>>>().toEqualTypeOf<
      ReturnType<typeof exportedUseLocalUser<MyUser>>
    >();
    expectTypeOf<Parameters<typeof Listing.usePeerChanges>>().toEqualTypeOf<
      Parameters<typeof exportedUsePeerChanges>
    >();
    expect(usePeerChanges).toBeTypeOf("function");
  });

  it("include the useSendEvent listing, which the typed result fixes to Events", () => {
    expectTypeOf<ReturnType<typeof Listing.useSendEvent<Events>>>().toEqualTypeOf<
      ReturnType<typeof exportedUseSendEvent<Events>>
    >();
    expectTypeOf(useSendEvent).returns.toEqualTypeOf<EventChannel<Events>["send"]>();
  });
});

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Leading whitespace differs between a sample and its copy inside a block, so compare trimmed lines.
const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

// Returns the ts or tsx block of `page` that contains `marker`, without import lines.
function docSample(page: string, marker: string): string {
  const markdown = readRepoFile(`apps/docs/content/docs/${page}`);
  const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${page}`);
  return block;
}

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/react/test/docs-react-samples-events.test.tsx"))
      .split("\n")
      .filter((line) => !line.includes("oxlint-disable"))
      .join("\n");
    const samples = [
      docSample("react/typed-hooks.mdx", "function Reactions"),
      docSample("react/typed-hooks.mdx", "createEventParser<Events>"),
      docSample("react/remote-users.mdx", "function JoinNotice"),
      docSample("react/local-context.mdx", "function NameField"),
      docSample("react/api/hooks.mdx", "function useLocalUser"),
      docSample("react/api/hooks.mdx", "function usePeerChanges"),
      docSample("react/api/hooks.mdx", "function useSendEvent"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });

  it("match the presence module, apart from the renamed useLocalUser", () => {
    const source = trimLines(readRepoFile("packages/react/test/docs-react-samples-events.test.tsx"));
    const sample = docSample("react/typed-hooks.mdx", "createPresenceHooks<Context, User, Events>");
    expect(source).toContain(trimLines(sample).replace("useLocalUser,", "useLocalUser: useTypedLocalUser,"));
  });
});

import { act, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createEventParser,
  createInMemoryPair,
  createPresenceClient,
  linearInterpolator,
  noneInterpolator,
} from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import type { DomBinding, WebSocketLike } from "@anchor-presence/dom";
import {
  CursorLayer,
  PresenceProvider,
  createPresenceHooks,
  usePresenceClient,
  useRemoteEvents,
} from "../src/index";
import type { RemoteUser } from "../src/index";
import { PresenceProviderContext } from "../src/context";
import { docSample, missingSamples } from "./doc-source";
import * as typed from "./doc-presence";
import type { Context, Events, User } from "./doc-presence";
import { parserOf } from "./test-utils";
import * as v from "valibot";
import type { InferSchemaOutput } from "@anchor-presence/core/standard-schema";

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: WebSocketLike["onopen"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  binaryType = "";
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
}

const seenBindings: (DomBinding | null)[] = [];
const seenClients: (PresenceClient | null)[] = [];

function Dashboard() {
  const { client, binding } = useContext(PresenceProviderContext);
  seenBindings.push(binding);
  seenClients.push(client);
  return <main data-anchor="dashboard" />;
}

// presence-provider.mdx: Rebuild the binding
function Workspace({ smooth }: { smooth: boolean }) {
  return (
    <PresenceProvider
      factory={() =>
        createPresenceClient({ transport: createWebSocketTransport({ port: 8788, path: "/?room=main" }) })
      }
      bindingKey={smooth}
      bindingOptions={{
        resolution: { interpolatorFactory: smooth ? linearInterpolator : noneInterpolator },
      }}
    >
      <Dashboard />
      <CursorLayer />
    </PresenceProvider>
  );
}

// presence-provider.mdx: Switch rooms
function Room({ room }: { room: string }) {
  return (
    <PresenceProvider
      clientKey={room}
      factory={() => {
        const transport = createWebSocketTransport({
          port: 8788,
          path: `/?room=${encodeURIComponent(room)}`,
        });
        return createPresenceClient({ transport });
      }}
    >
      <Dashboard />
      <CursorLayer />
    </PresenceProvider>
  );
}

// connection-status.mdx: Close reasons
function TokenError() {
  const client = usePresenceClient();
  const [closeCode, setCloseCode] = useState<number | null>(null);

  useEffect(
    () =>
      client?.subscribeClose((close) => {
        if (!close.willReconnect) setCloseCode(close.code ?? null);
      }),
    [client],
  );

  if (closeCode !== 4006) return null;
  return <div role="alert">The relay rejected the room token.</div>;
}

// remote-events.mdx: Send and receive
function Reactions() {
  const client = usePresenceClient();
  const [lastReaction, setLastReaction] = useState<string | null>(null);

  useRemoteEvents((event) => {
    if (event.type === "reaction" && typeof event.data === "string") {
      setLastReaction(`${event.clientId}: ${event.data}`);
    }
  });

  return (
    <div>
      <button type="button" onClick={() => client?.sendEvent("reaction", "wave")}>
        Wave
      </button>
      {lastReaction !== null && <p role="status">{lastReaction}</p>}
    </div>
  );
}

const { useSendEvent } = typed;

// remote-events.mdx: Send typed events
function WaveButton() {
  const sendEvent = useSendEvent();
  return (
    <button type="button" onClick={() => sendEvent("reaction", { emoji: "wave" })}>
      Wave
    </button>
  );
}

const parseUser = parserOf<User>();
const parseContext = parserOf<Context>();
const { useRemoteUsers } = typed;

// typed-hooks.mdx: Use the hooks
function PresenceList() {
  const users = useRemoteUsers();
  return (
    <ul>
      {users.map((entry) => (
        <li key={entry.clientId}>{entry.user?.name ?? "Guest"}</li>
      ))}
    </ul>
  );
}

function TypeErrors() {
  const users = useRemoteUsers();
  // @ts-expect-error User has no age field
  const age: unknown = users[0]?.user?.age;
  // @ts-expect-error the typed hook takes no type argument
  useRemoteUsers<{ id: number }>();
  return <span>{String(age)}</span>;
}

// typed-hooks.mdx: Infer the types from schemas
const userSchema = v.object({ name: v.string(), color: v.string() });
const contextSchema = v.object({ pageId: v.string() });

export const schemaHooks = createPresenceHooks<
  InferSchemaOutput<typeof contextSchema>,
  InferSchemaOutput<typeof userSchema>
>();

describe("react docs samples", () => {
  it("typed-hooks.mdx: schema output types fix the hook types", () => {
    expectTypeOf(schemaHooks.useRemoteUsers).returns.toEqualTypeOf<
      readonly RemoteUser<{ name: string; color: string }>[]
    >();
  });

  it("typed-hooks.mdx: the result has every name the sample destructures", () => {
    for (const name of [
      "PresenceProvider",
      "usePresenceClient",
      "useLocalContext",
      "useRemoteCursors",
      "useRemoteUsers",
    ]) {
      expect(typed).toHaveProperty(name);
    }
    expectTypeOf(typed.useLocalContext).returns.toEqualTypeOf<
      [Context | undefined, (next: Context | undefined) => void]
    >();
  });

  const roots: Root[] = [];
  const containers: HTMLDivElement[] = [];

  function mount(node: React.ReactNode): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(node));
    roots.push(root);
    containers.push(container);
    return container;
  }

  beforeEach(() => {
    FakeSocket.instances = [];
    seenBindings.length = 0;
    seenClients.length = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    for (const container of containers.splice(0)) container.remove();
    vi.unstubAllGlobals();
  });

  it("bindingKey rebuilds the binding and keeps the client and its socket", () => {
    mount(<Workspace smooth />);
    const firstBinding = seenBindings.at(-1);
    act(() => roots[0]!.render(<Workspace smooth={false} />));
    expect(seenBindings.at(-1)).not.toBeNull();
    expect(seenBindings.at(-1)).not.toBe(firstBinding);
    expect(new Set(seenClients.filter(Boolean)).size).toBe(1);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("clientKey disposes the old client and connects to the new room", () => {
    mount(<Room room="a" />);
    act(() => roots[0]!.render(<Room room="b" />));
    expect(FakeSocket.instances.map((socket) => new URL(socket.url).search)).toEqual(["?room=a", "?room=b"]);
    expect(FakeSocket.instances[0]!.readyState).toBe(3);
    expect(new Set(seenClients.filter(Boolean)).size).toBe(2);
  });

  it("TokenError shows an alert after a 4006 close", () => {
    const container = mount(
      <PresenceProvider
        factory={() =>
          createPresenceClient({ transport: createWebSocketTransport({ port: 8788, path: "/?room=main" }) })
        }
      >
        <TokenError />
      </PresenceProvider>,
    );
    expect(container.querySelector("[role=alert]")).toBeNull();
    act(() => FakeSocket.instances[0]!.onclose?.({ code: 4006 }));
    expect(container.querySelector("[role=alert]")?.textContent).toBe("The relay rejected the room token.");
  });

  it("Reactions sends an event that only the peer receives", () => {
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a });
    const receiver = createPresenceClient({ transport: b });
    const senderView = mount(
      <PresenceProvider client={sender}>
        <Reactions />
      </PresenceProvider>,
    );
    const receiverView = mount(
      <PresenceProvider client={receiver}>
        <Reactions />
      </PresenceProvider>,
    );

    act(() => senderView.querySelector("button")!.click());

    expect(receiverView.querySelector("[role=status]")?.textContent).toBe(`${sender.clientId}: wave`);
    expect(senderView.querySelector("[role=status]")).toBeNull();
    sender.dispose();
    receiver.dispose();
  });

  it("WaveButton sends a typed reaction that the peer receives", () => {
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({
      transport: a,
      parseUser,
      parseContext,
      parseEvent: createEventParser<Events>({
        reaction: (data) =>
          typeof data === "object" && data !== null && "emoji" in data
            ? { emoji: String(data.emoji) }
            : undefined,
        chat: () => undefined,
        ping: null,
      }),
    });
    const receiver = createPresenceClient({ transport: b });
    const received: unknown[] = [];
    receiver.subscribeEvents((event) => received.push(event.data));
    const senderView = mount(
      <typed.PresenceProvider client={sender}>
        <WaveButton />
      </typed.PresenceProvider>,
    );

    act(() => senderView.querySelector("button")!.click());

    expect(received).toEqual([{ emoji: "wave" }]);
    sender.dispose();
    receiver.dispose();
  });

  it("PresenceList renders typed remote users", async () => {
    const { a, b } = createInMemoryPair();
    const local = createPresenceClient({
      transport: a,
      parseUser,
      parseContext,
      parseEvent: createEventParser<Events>({ reaction: () => undefined, chat: () => undefined, ping: null }),
      user: { name: "Me", color: "blue" },
    });
    const peer = createPresenceClient({
      transport: b,
      parseUser,
      parseContext,
      user: { name: "Ada", color: "red" },
    });
    const view = mount(
      <typed.PresenceProvider client={local}>
        <PresenceList />
        <TypeErrors />
      </typed.PresenceProvider>,
    );

    peer.setLocalCursor({ anchors: [], viewport: { u: 0.5, v: 0.5 } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(view.querySelector("li")?.textContent).toBe("Ada");
    local.dispose();
    peer.dispose();
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    expect(
      missingSamples("docs-react-samples.test.tsx", [
        docSample("react/presence-provider.mdx", "function Workspace"),
        docSample("react/presence-provider.mdx", "function Room"),
        docSample("react/connection-status.mdx", "function TokenError"),
        docSample("react/remote-events.mdx", "function Reactions"),
        docSample("react/remote-events.mdx", "function WaveButton"),
        docSample("react/typed-hooks.mdx", "export const schemaHooks"),
        docSample("react/typed-hooks.mdx", "function PresenceList"),
      ]),
    ).toEqual([]);
    expect(
      missingSamples("doc-presence.ts", [
        docSample("react/typed-hooks.mdx", "createPresenceHooks<Context, User, Events>"),
      ]),
    ).toEqual([]);
  });
});

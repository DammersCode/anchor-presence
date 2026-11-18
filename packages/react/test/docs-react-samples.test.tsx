import { act, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
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
  LiveCursorProvider,
  createPresenceHooks,
  useCursorClient,
  useCursorEvents,
  useSendEvent,
} from "../src/index";
import { LiveCursorContext } from "../src/context";
import { docSample, missingSamples } from "./doc-source";

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
  const { client, binding } = useContext(LiveCursorContext);
  seenBindings.push(binding);
  seenClients.push(client);
  return <main data-anchor="dashboard" />;
}

// live-cursor-provider.mdx: Rebuild the binding
function Workspace({ smooth }: { smooth: boolean }) {
  return (
    <LiveCursorProvider
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
    </LiveCursorProvider>
  );
}

// live-cursor-provider.mdx: Switch rooms
function Room({ room }: { room: string }) {
  return (
    <LiveCursorProvider
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
    </LiveCursorProvider>
  );
}

// connection-status.mdx: Close reasons
function TokenError() {
  const client = useCursorClient();
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

// cursor-events.mdx: Send and receive
function Reactions() {
  const client = useCursorClient();
  const [lastReaction, setLastReaction] = useState<string | null>(null);

  useCursorEvents((event) => {
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

// cursor-events.mdx: Send typed events
type Events = { reaction: string };

function WaveButton() {
  const sendEvent = useSendEvent<Events>();
  return (
    <button type="button" onClick={() => sendEvent("reaction", "wave")}>
      Wave
    </button>
  );
}

// typed-hooks.mdx: presence.ts
type User = { name: string; color: string };
type Context = { pageId: string };

const typed = createPresenceHooks<Context, User>();
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

describe("react docs samples", () => {
  it("typed-hooks.mdx: the result has every name the sample destructures", () => {
    for (const name of [
      "LiveCursorProvider",
      "useCursorClient",
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
      <LiveCursorProvider
        factory={() =>
          createPresenceClient({ transport: createWebSocketTransport({ port: 8788, path: "/?room=main" }) })
        }
      >
        <TokenError />
      </LiveCursorProvider>,
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
      <LiveCursorProvider client={sender}>
        <Reactions />
      </LiveCursorProvider>,
    );
    const receiverView = mount(
      <LiveCursorProvider client={receiver}>
        <Reactions />
      </LiveCursorProvider>,
    );

    act(() => senderView.querySelector("button")!.click());

    expect(receiverView.querySelector("[role=status]")?.textContent).toBe(`${sender.clientId}: wave`);
    expect(senderView.querySelector("[role=status]")).toBeNull();
    sender.dispose();
    receiver.dispose();
  });

  it("WaveButton sends a typed reaction that the peer receives", () => {
    const { a, b } = createInMemoryPair();
    const sender = createPresenceClient({ transport: a });
    const receiver = createPresenceClient({ transport: b });
    const senderView = mount(
      <LiveCursorProvider client={sender}>
        <WaveButton />
      </LiveCursorProvider>,
    );
    const receiverView = mount(
      <LiveCursorProvider client={receiver}>
        <Reactions />
      </LiveCursorProvider>,
    );

    act(() => senderView.querySelector("button")!.click());

    expect(receiverView.querySelector("[role=status]")?.textContent).toBe(`${sender.clientId}: wave`);
    sender.dispose();
    receiver.dispose();
  });

  it("PresenceList renders typed remote users", async () => {
    const { a, b } = createInMemoryPair();
    const local = createPresenceClient<Context, User>({ transport: a, user: { name: "Me", color: "blue" } });
    const peer = createPresenceClient<Context, User>({ transport: b, user: { name: "Ada", color: "red" } });
    const view = mount(
      <typed.LiveCursorProvider client={local}>
        <PresenceList />
        <TypeErrors />
      </typed.LiveCursorProvider>,
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
        docSample("react/live-cursor-provider.mdx", "function Workspace"),
        docSample("react/live-cursor-provider.mdx", "function Room"),
        docSample("react/connection-status.mdx", "function TokenError"),
        docSample("react/cursor-events.mdx", "function Reactions"),
        docSample("react/cursor-events.mdx", "function WaveButton"),
      ]),
    ).toEqual([]);
  });
});

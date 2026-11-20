import { act, useContext } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createPresenceClient } from "@dammers/anchor-presence-core";
import type { PresenceClient } from "@dammers/anchor-presence-core";
import { PresenceProvider } from "../src/index";
import { PresenceProviderContext } from "../src/context";
import { docSample, missingSamples } from "./doc-source";
import { createSignalRTransport } from "../../../examples/signalr/transport";
import { createSocketIoTransport } from "../../../examples/socketio/transport";
// The test does not import @microsoft/signalr: it is a dependency of examples/signalr only, so the root cannot resolve it.
type HubConnection = Parameters<typeof createSignalRTransport>[0];

// Same chain as the sample: withUrl, withAutomaticReconnect, build.
class HubConnectionBuilder {
  withUrl(_url: string): this {
    return this;
  }
  withAutomaticReconnect(): this {
    return this;
  }
  build(): HubConnection {
    return {
      state: "Disconnected",
      on() {},
      off() {},
      onclose() {},
      onreconnecting() {},
      onreconnected() {},
      start: async () => {},
      stop: async () => {},
      send: async () => {},
    } as unknown as HubConnection;
  }
}

// Stands in for the `useSignalR` hook of the app's use-signalr contract.
let currentConnection: HubConnection | null = null;
function useSignalR() {
  return { getConnection: (_hub: string) => currentConnection };
}

// signalr.mdx: Client transport
function signalRClient() {
  const connection = new HubConnectionBuilder()
    .withUrl("https://your-server.example/hubs/presence?room=main")
    .withAutomaticReconnect()
    .build();

  const transport = createSignalRTransport(connection);
  const client = createPresenceClient({ transport });
  return client;
}

// signalr.mdx: Close reasons
function warnOnInvalidRoom(client: PresenceClient) {
  client.subscribeClose((close) => {
    if (close.code === 4007) console.warn("The room name is not valid.");
  });
}

// socketio.mdx: Close reasons
function warnOnFullRoom(client: PresenceClient) {
  client.subscribeClose((close) => {
    if (!close.willReconnect && close.code === 4001) console.warn("The room is full.");
  });
}

// signalr.mdx: Share a use-signalr connection
function AppPresenceProvider({ children }: { children: ReactNode }) {
  const { getConnection } = useSignalR();
  const connection = getConnection("/hubs/presence");
  if (connection === null) return children;
  return (
    <PresenceProvider
      clientKey={connection}
      factory={() => {
        // use-signalr owns the connection, so disposing the client must not stop it
        const transport = createSignalRTransport(connection, { stopConnection: false });
        return createPresenceClient({ transport });
      }}
    >
      {children}
    </PresenceProvider>
  );
}

function fakeConnection() {
  const handlers = new Map<string, (...args: never[]) => void>();
  const closeCallbacks: ((error?: Error) => void)[] = [];
  const on = vi.fn((event: string, handler: (...args: never[]) => void) => handlers.set(event, handler));
  const stop = vi.fn(async () => {});
  const connection = {
    state: "Connected",
    on,
    off: vi.fn(),
    onclose: (callback: (error?: Error) => void) => closeCallbacks.push(callback),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    start: vi.fn(async () => {}),
    stop,
    send: vi.fn(async () => {}),
  } as unknown as HubConnection;
  const transportsBuilt = () => on.mock.calls.filter(([event]) => event === "PresenceReceived").length;
  const refuseAndClose = (code: number, reason: string) => {
    (handlers.get("Refused") as ((code: number, reason: string) => void) | undefined)?.(code, reason);
    for (const callback of closeCallbacks) callback(new Error("aborted"));
  };
  return { connection, stop, transportsBuilt, refuseAndClose };
}

const seenClients: (PresenceClient | null)[] = [];
function Dashboard() {
  seenClients.push(useContext(PresenceProviderContext).client);
  return <main data-anchor="dashboard" />;
}

describe("signalr.mdx samples", () => {
  const roots: Root[] = [];

  function mount(node: ReactNode): Root {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(node));
    roots.push(root);
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    currentConnection = null;
    seenClients.length = 0;
  });

  it("builds a presence client on a HubConnection", () => {
    expectTypeOf(signalRClient).returns.toEqualTypeOf<PresenceClient>();
  });

  it("reports the 4007 refusal of the hub through subscribeClose", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeConnection();
    const client = createPresenceClient({ transport: createSignalRTransport(fake.connection) });
    warnOnInvalidRoom(client);
    fake.refuseAndClose(4007, "invalid room");
    expect(warn).toHaveBeenCalledWith("The room name is not valid.");
    client.dispose();
    warn.mockRestore();
  });

  it("reports the 4001 refusal of the Socket.IO relay through subscribeClose", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handlers = new Map<string, (...args: never[]) => void>();
    const socket = {
      connected: true,
      active: false,
      on: (event: string, handler: (...args: never[]) => void) => handlers.set(event, handler),
      off: () => {},
      emit: () => {},
      connect: () => {},
      disconnect: () => {},
      io: { on: () => {} },
    } as unknown as Parameters<typeof createSocketIoTransport>[0];
    const client = createPresenceClient({ transport: createSocketIoTransport(socket) });
    warnOnFullRoom(client);
    (handlers.get("refused") as (info: { code: number; reason: string }) => void)({
      code: 4001,
      reason: "room full",
    });
    (handlers.get("disconnect") as (reason: string) => void)("io server disconnect");
    expect(warn).toHaveBeenCalledWith("The room is full.");
    client.dispose();
    warn.mockRestore();
  });

  it("creates one client for the shared connection across renders", () => {
    const fake = fakeConnection();
    currentConnection = fake.connection;
    const root = mount(
      <AppPresenceProvider>
        <Dashboard />
      </AppPresenceProvider>,
    );
    for (let render = 0; render < 3; render += 1) {
      act(() =>
        root.render(
          <AppPresenceProvider>
            <Dashboard />
          </AppPresenceProvider>,
        ),
      );
    }
    expect(fake.transportsBuilt()).toBe(1);
    expect(new Set(seenClients.filter(Boolean)).size).toBe(1);
  });

  it("renders the children without a client until use-signalr opens the hub", () => {
    const root = mount(
      <AppPresenceProvider>
        <Dashboard />
      </AppPresenceProvider>,
    );
    expect(seenClients.every((client) => client === null)).toBe(true);

    const fake = fakeConnection();
    currentConnection = fake.connection;
    act(() =>
      root.render(
        <AppPresenceProvider>
          <Dashboard />
        </AppPresenceProvider>,
      ),
    );
    expect(seenClients.at(-1)).not.toBeNull();
  });

  it("disposes the client on unmount and keeps the shared connection open", () => {
    const fake = fakeConnection();
    currentConnection = fake.connection;
    const root = mount(
      <AppPresenceProvider>
        <Dashboard />
      </AppPresenceProvider>,
    );
    const client = seenClients.at(-1)!;
    act(() => root.unmount());
    roots.splice(0);
    expect(client.sendEvent("reaction", "wave")).toBe(false);
    expect(fake.stop).not.toHaveBeenCalled();
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    expect(
      missingSamples("docs-backends-samples.test.tsx", [
        docSample("examples/backends/signalr.mdx", "function AppPresenceProvider"),
      ]),
    ).toEqual([]);
  });
});

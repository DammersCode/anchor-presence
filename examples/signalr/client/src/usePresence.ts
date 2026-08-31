import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { useSignalR } from "./signalr";
import {
  createSignalRTransport,
  EVENT_RECEIVED,
  jsonCodec,
  METHOD_SEND,
  PRESENCE_HUB,
  type SignalRHarness,
} from "./transport";

// Fixed per-browser identity so a tab's cursor keeps its name across refreshes
// (the transport itself is connection-scoped).
// Dev origin of the C# relay; override with ?server=http://host:port when needed.
export const SERVER_URL =
  new URLSearchParams(window.location.search).get("server") ?? "http://localhost:5000";

const NAME_KEY = "signalr-demo-name";
const COLOR_KEY = "signalr-demo-color";

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#a855f7", "#ec4891", "#14b8a6"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function identity(): { name: string; color: string } {
  const name = localStorage.getItem(NAME_KEY) ?? `Demo-${Math.floor(1000 + Math.random() * 9000)}`;
  const color = localStorage.getItem(COLOR_KEY) ?? PALETTE[hashString(name) % PALETTE.length]!;
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(COLOR_KEY, color);
  return { name, color };
}

export type DemoUser = { name: string; color: string };
export type DemoContext = { page?: "overview" | "metrics" };

type UseSignalRCtx = ReturnType<(typeof import("./signalr"))["useSignalR"]>;

/**
 * Builds the presence client over a use-signalr context. Pure so it stays
 * testable; the harness reads hub status live from use-signalr's statusStore,
 * and the transport re-reads it whenever the store fires.
 */
export function buildPresenceClient(ctx: UseSignalRCtx): PresenceClient<DemoContext, DemoUser> {
  const { getConnection, statusStore } = ctx;

  // `connection.off` needs the exact function that was registered, so the
  // harness remembers the handler it attached.
  let attachedHandler: ((payload: string) => void) | null = null;

  const hub: SignalRHarness = {
    send: (payload: string) => {
      const connection = getConnection(PRESENCE_HUB);
      return connection ? connection.send(METHOD_SEND, payload) : Promise.resolve();
    },
    onConnected: (handler: (payload: string) => void) => {
      attachedHandler = handler;
      getConnection(PRESENCE_HUB)?.on(EVENT_RECEIVED, handler);
    },
    onDisconnected: () => {
      if (attachedHandler !== null) getConnection(PRESENCE_HUB)?.off(EVENT_RECEIVED, attachedHandler);
      attachedHandler = null;
    },
    getStatus: () => statusStore.get(PRESENCE_HUB),
    subscribeStatus: (listener: () => void) => statusStore.subscribe(PRESENCE_HUB, listener),
  };

  const params = new URLSearchParams(window.location.search);
  const staleMs = Number(params.get("stale-ms") ?? 70_000);
  const heartbeatMs = Number(params.get("heartbeat-ms") ?? 10_000);

  const { transport, dispose } = createSignalRTransport(hub);
  const presence = createPresenceClient<DemoContext, DemoUser>({
    transport,
    codec: jsonCodec,
    user: identity(),
    staleTimeoutMs: staleMs,
    heartbeatMs,
  });
  presence.registerTeardown(dispose);
  return presence;
}

// Page-lifetime singleton, same pattern as apps/demo/src/cursors/setup.ts. A
// PresenceClient is not re-subscribable once disposed, so it must survive
// StrictMode's double mount; one client per tab for the page's life.
let singletonClient: PresenceClient<DemoContext, DemoUser> | null = null;

export function usePresence(): PresenceClient<DemoContext, DemoUser> {
  // The hook runs on every render; only the (one-shot) client creation is
  // guarded, so this stays StrictMode-safe.
  const ctx = useSignalR();
  if (singletonClient === null) singletonClient = buildPresenceClient(ctx);
  return singletonClient;
}

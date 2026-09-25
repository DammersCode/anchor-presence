// Picks which relay backend the demo talks to, at runtime, via ?backend= or VITE_BACKEND.
// Every backend but socketio/signalr is a plain WebSocket relay: same transport, different port.
import { binaryCodec, jsonCodec, type CursorCodec, type LiveCursorTransport } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { io } from "socket.io-client";
import { createSocketIoTransport } from "../../../../examples/socketio/transport";
import { createSignalRTransport, type SignalRHarness } from "../../../../examples/signalr/transport";
import { HubConnectionBuilder, type HubConnection } from "@microsoft/signalr";
import type { HubConnectionStatus } from "@dammers/use-signalr-react";

export type BackendId = "bun" | "bun-native" | "node-ws" | "hono" | "elysia" | "socketio" | "signalr";

// "bun" is apps/server, the reference relay on the spec's default port 8787. e2e and CI rely on
// this default staying wired to apps/server, so it must never move to one of the newer examples.
export const DEFAULT_BACKEND: BackendId = "bun";

const BACKEND_IDS: readonly BackendId[] = [
  "bun",
  "bun-native",
  "node-ws",
  "hono",
  "elysia",
  "socketio",
  "signalr",
];

function isBackendId(value: string | null): value is BackendId {
  return value !== null && (BACKEND_IDS as readonly string[]).includes(value);
}

// Read structurally instead of via the ambient `ImportMetaEnv` type, so this file typechecks
// under tsconfig.test.json too, which does not load Vite's client types.
type ViteEnvMeta = { env?: Record<string, string | undefined> };

/** Reads the backend choice from `?backend=`, then `VITE_BACKEND`, falling back to apps/server. */
export function resolveBackendId(search: string): BackendId {
  const fromQuery = new URLSearchParams(search).get("backend");
  if (isBackendId(fromQuery)) return fromQuery;
  const fromEnv = (import.meta as ViteEnvMeta).env?.VITE_BACKEND;
  if (isBackendId(fromEnv ?? null)) return fromEnv as BackendId;
  return DEFAULT_BACKEND;
}

// Native-WebSocket backends only differ by port. "bun" is apps/server; the rest are examples/*.
const NATIVE_WS_PORTS: Record<"bun" | "bun-native" | "node-ws" | "hono" | "elysia", number> = {
  bun: 8787,
  "bun-native": 8788,
  "node-ws": 8789,
  hono: 8790,
  elysia: 8791,
};

function mapHubStatus(state: HubConnection["state"]): HubConnectionStatus {
  switch (state) {
    case "Connected":
      return "connected";
    case "Reconnecting":
      return "reconnecting";
    case "Disconnected":
      return "disconnected";
    default:
      return "connecting";
  }
}

function createSignalRHarness(connection: HubConnection): SignalRHarness {
  const statusListeners = new Set<() => void>();
  const notify = () => {
    for (const listener of statusListeners) listener();
  };
  connection.onclose(notify);
  connection.onreconnecting(notify);
  connection.onreconnected(notify);

  return {
    send: (payload) => connection.send("OnPresence", payload),
    onConnected: (handler) => connection.on("PresenceReceived", handler),
    onDisconnected: () => connection.off("PresenceReceived"),
    getStatus: () => mapHubStatus(connection.state),
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
}

/** Builds the transport and codec for one backend. Call once per app load; the room is baked into the URL/query. */
export function createBackendTransport(
  backend: BackendId,
  room: string,
): { transport: LiveCursorTransport; codec: CursorCodec } {
  if (backend === "socketio") {
    const socket = io("http://localhost:5001", { query: { room }, transports: ["websocket"] });
    return { transport: createSocketIoTransport(socket), codec: jsonCodec };
  }

  if (backend === "signalr") {
    const connection = new HubConnectionBuilder()
      .withUrl(`http://localhost:5000/hubs/presence?room=${encodeURIComponent(room)}`)
      .withAutomaticReconnect()
      .build();
    const { transport } = createSignalRTransport(createSignalRHarness(connection));
    void connection.start();
    return { transport, codec: jsonCodec };
  }

  const port = NATIVE_WS_PORTS[backend];
  const transport = createWebSocketTransport({ port, path: `/?room=${encodeURIComponent(room)}` });
  return { transport, codec: binaryCodec };
}

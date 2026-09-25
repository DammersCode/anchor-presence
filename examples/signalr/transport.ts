import { jsonCodec, type ConnectionStatus, type LiveCursorTransport } from "@anchor-presence/core";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";

// The hub path the whole app talks to; a single relay hub.
export const PRESENCE_HUB = "/hubs/presence";

// Wire names between the C# hub and the client.
export const EVENT_RECEIVED = "PresenceReceived";
export const METHOD_SEND = "OnPresence";

// Core's default JSON codec, re-exported so the transport and the presence client
// share one encoding.
export { jsonCodec };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Maps a `HubConnection`'s state onto core's `ConnectionStatus`. */
export function mapStatus(state: HubConnectionState): ConnectionStatus {
  switch (state) {
    case HubConnectionState.Connected:
      return "connected";
    case HubConnectionState.Reconnecting:
      return "reconnecting";
    case HubConnectionState.Disconnected:
      return "disconnected";
    default:
      return "connecting";
  }
}

/**
 * `LiveCursorTransport` over a `@microsoft/signalr` `HubConnection`.
 *
 * - `connect` calls `connection.start()`; a no-op while already starting or connected.
 * - `send` drops the payload while the hub is not `connected`, otherwise UTF-8-decodes
 *   the JSON bytes and forwards them as the single hub-method argument.
 * - `subscribe` fans out `PresenceReceived` payloads, re-encoded to bytes.
 * - `subscribeStatus` maps `onclose` / `onreconnecting` / `onreconnected` onto
 *   core's `ConnectionStatus` and replays the current status to a new listener.
 *
 * The relay never inspects the payload; validation stays receiver-side (spec §4).
 */
export function createSignalRTransport(connection: HubConnection): LiveCursorTransport {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const dataListeners = new Set<(data: Uint8Array) => void>();
  let status: ConnectionStatus = mapStatus(connection.state);

  const setStatus = (next: ConnectionStatus): void => {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  };

  connection.onreconnecting(() => setStatus("reconnecting"));
  connection.onreconnected(() => setStatus("connected"));
  connection.onclose(() => setStatus("disconnected"));

  connection.on(EVENT_RECEIVED, (payload: string) => {
    const bytes = encoder.encode(payload);
    for (const listener of dataListeners) listener(bytes);
  });

  return {
    connect: async () => {
      // Idempotent: a fresh connection reports Disconnected; starting or connected, skip.
      if (connection.state !== HubConnectionState.Disconnected) return;
      setStatus("connecting");
      await connection.start();
      setStatus("connected");
    },
    disconnect: () => connection.stop(),
    send: async (data) => {
      if (status !== "connected") return;
      await connection.send(METHOD_SEND, decoder.decode(data));
    },
    subscribe: (listener) => {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status);
      return () => {
        statusListeners.delete(listener);
      };
    },
    getStatus: () => status,
  };
}

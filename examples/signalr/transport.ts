import {
  jsonCodec,
  type ConnectionStatus,
  type LiveCursorTransport,
  type TransportClose,
} from "@anchor-presence/core";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";

// The hub path the whole app talks to; a single relay hub.
export const PRESENCE_HUB = "/hubs/presence";

// Wire names between the C# hub and the client.
export const EVENT_RECEIVED = "PresenceReceived";
export const EVENT_REFUSED = "Refused";
export const METHOD_SEND = "OnPresence";

// Core's default JSON codec, re-exported so the transport and the presence client
// share one encoding.
export { jsonCodec };

// The hub relays strings, so bytes travel as base64 and any codec survives the trip.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
  } catch {
    return null;
  }
}

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
 * - `send` drops the payload while the hub is not `connected`, otherwise base64-encodes
 *   the bytes and forwards them as the single hub-method argument.
 * - `subscribe` fans out `PresenceReceived` payloads, base64-decoded to bytes.
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

  const closeListeners = new Set<(close: TransportClose) => void>();
  let refusal: { code: number; reason: string } | undefined;
  const emitClose = (error: Error | undefined, willReconnect: boolean): void => {
    const close: TransportClose = { willReconnect };
    if (refusal !== undefined) close.code = refusal.code;
    const reason = refusal?.reason ?? error?.message;
    if (reason !== undefined) close.reason = reason;
    for (const listener of closeListeners) {
      try {
        listener(close);
      } catch {
        // a throwing listener must not stop the status update
      }
    }
  };

  connection.on(EVENT_REFUSED, (code: number, reason: string) => {
    refusal = { code, reason };
  });
  connection.onreconnecting((error) => {
    emitClose(error, true);
    setStatus("reconnecting");
  });
  connection.onreconnected(() => setStatus("connected"));
  connection.onclose((error) => {
    emitClose(error, false);
    setStatus("disconnected");
  });

  connection.on(EVENT_RECEIVED, (payload: string) => {
    const bytes = fromBase64(payload);
    if (bytes === null) return;
    for (const listener of dataListeners) listener(bytes);
  });

  return {
    connect: async () => {
      // Idempotent: a fresh connection reports Disconnected; starting or connected, skip.
      if (connection.state !== HubConnectionState.Disconnected) return;
      setStatus("connecting");
      try {
        await connection.start();
      } catch (error) {
        // a failed first start is not retried by withAutomaticReconnect: report it instead of hanging at "connecting"
        setStatus("disconnected");
        throw error;
      }
      setStatus("connected");
    },
    disconnect: () => {
      connection.off(EVENT_REFUSED);
      connection.off(EVENT_RECEIVED);
      return connection.stop();
    },
    send: async (data) => {
      if (status !== "connected") return;
      await connection.send(METHOD_SEND, toBase64(data));
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
    subscribeClose: (listener) => {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
  };
}

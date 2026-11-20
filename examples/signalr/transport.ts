import {
  jsonCodec,
  type ConnectionStatus,
  type PresenceTransport,
  type TransportClose,
} from "@dammers/anchor-presence-core";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";

// The hub path the whole app talks to; a single relay hub.
export const PRESENCE_HUB = "/hubs/presence";

// Wire names between the C# hub and the client.
export const EVENT_RECEIVED = "PresenceReceived";
export const EVENT_REFUSED = "Refused";
export const METHOD_SEND = "OnPresence";

const CONNECTING_POLL_MS = 50;
const CONNECTING_POLL_LIMIT = 200;
const SLOW_POLL_MS = 1000;

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
 * `PresenceTransport` over a `@microsoft/signalr` `HubConnection`.
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
export function createSignalRTransport(
  connection: HubConnection,
  options: { stopConnection?: boolean } = {},
): PresenceTransport {
  const stopConnection = options.stopConnection ?? true;
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const dataListeners = new Set<(data: Uint8Array) => void>();
  let status: ConnectionStatus = mapStatus(connection.state);
  // a shared connection (stopConnection: false) keeps firing callbacks after this transport disconnects
  let active = true;
  let connectGeneration = 0;

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

  const onRefused = (code: number, reason: string): void => {
    refusal = { code, reason };
  };
  const onReceived = (payload: string): void => {
    const bytes = fromBase64(payload);
    if (bytes === null) return;
    for (const listener of dataListeners) listener(bytes);
  };
  let handlersRegistered = false;
  const registerHandlers = (): void => {
    if (handlersRegistered) return;
    handlersRegistered = true;
    connection.on(EVENT_REFUSED, onRefused);
    connection.on(EVENT_RECEIVED, onReceived);
  };
  registerHandlers();

  connection.onreconnecting((error) => {
    if (!active) return;
    emitClose(error, true);
    setStatus("reconnecting");
  });
  connection.onreconnected(() => {
    if (active) setStatus("connected");
  });
  connection.onclose((error) => {
    if (!active) return;
    emitClose(error, false);
    setStatus("disconnected");
  });

  return {
    connect: async () => {
      registerHandlers();
      active = true;
      const generation = ++connectGeneration;
      // a shared connection that is still starting, or one that is still stopping: wait for it instead of returning early
      for (
        let tries = 0;
        connection.state === HubConnectionState.Connecting ||
        connection.state === HubConnectionState.Disconnecting;
        tries++
      ) {
        setStatus("connecting");
        await new Promise((resolve) =>
          setTimeout(resolve, tries < CONNECTING_POLL_LIMIT ? CONNECTING_POLL_MS : SLOW_POLL_MS),
        );
        if (generation !== connectGeneration) return;
      }
      // Idempotent: a fresh connection reports Disconnected; connected or reconnecting, skip.
      if (connection.state !== HubConnectionState.Disconnected) {
        setStatus(mapStatus(connection.state));
        return;
      }
      setStatus("connecting");
      try {
        await connection.start();
      } catch (error) {
        if (generation !== connectGeneration) return;
        // a failed first start is not retried by withAutomaticReconnect: report it instead of hanging at "connecting"
        setStatus("disconnected");
        throw error;
      }
      if (generation !== connectGeneration) return;
      setStatus("connected");
    },
    disconnect: () => {
      const generation = ++connectGeneration;
      connection.off(EVENT_REFUSED, onRefused);
      connection.off(EVENT_RECEIVED, onReceived);
      handlersRegistered = false;
      if (stopConnection) {
        return connection.stop().finally(() => {
          if (generation === connectGeneration) setStatus(mapStatus(connection.state));
        });
      }
      active = false;
      setStatus("disconnected");
      return Promise.resolve();
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

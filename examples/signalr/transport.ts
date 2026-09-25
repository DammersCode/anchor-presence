import { jsonCodec, type ConnectionStatus, type LiveCursorTransport } from "@anchor-presence/core";
import type { HubConnectionStatus } from "@dammers/use-signalr-react";

// The hub path the whole app talks to; a single relay hub.
export const PRESENCE_HUB = "/hubs/presence";

// Wire names between the C# hub and the client.
export const EVENT_RECEIVED = "PresenceReceived";
export const METHOD_SEND = "OnPresence";

// Core's default JSON codec, re-exported so the adapter and the presence client
// share one encoding.
export { jsonCodec };

/**
 * The live-connection surface the adapter needs. use-signalr's context (via
 * `getConnection` + `statusStore`) provides all of it; unit tests supply a mock.
 *
 * `onConnected` / `onDisconnected` let the adapter attach and drop its event
 * listener when the hub's connection comes and goes — use-signalr creates the
 * `HubConnection` after the render that this adapter is built in, so the
 * adapter must bind at transition time, not at construction.
 */
export interface SignalRHarness {
  /** Fire-and-forget method call; resolves immediately when the hub is not connected. */
  send(payload: string): Promise<void>;
  /** Attach the handler to the current hub connection. Called while the hub is `connected`. */
  onConnected(handler: (payload: string) => void): void;
  /** Detach the handler. Called while the hub leaves `connected`. */
  onDisconnected(): void;
  /** Point read of the hub's current status. */
  getStatus(): HubConnectionStatus;
  /** Subscribe to status changes; the adapter re-reads `getStatus()` on each fire. */
  subscribeStatus(listener: () => void): () => void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Maps use-signalr's status set onto core's ConnectionStatus. */
export function mapStatus(raw: HubConnectionStatus): ConnectionStatus {
  return raw === "reconnected" ? "connected" : raw;
}

/**
 * `LiveCursorTransport` over a use-signalr connection.
 *
 * - `send` drops the payload while the hub is not `connected` (mirrors
 *   use-signalr's fire-and-forget `send`), otherwise UTF-8-decodes the JSON
 *   bytes and forwards them as the single hub-method argument.
 * - `subscribe` fans out `PresenceReceived` payloads, re-encoded to bytes. The
 *   event handler attaches on the first `connected` event and detaches when
 *   the hub leaves `connected`, re-binding to a fresh connection on reconnect.
 * - `subscribeStatus` normalizes the hub status onto core's ConnectionStatus.
 *
 * The relay never inspects the payload; validation stays receiver-side (spec §4).
 */
export function createSignalRTransport(harness: SignalRHarness): {
  transport: LiveCursorTransport;
  dispose: () => void;
} {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const dataListeners = new Set<(data: Uint8Array) => void>();

  let status: ConnectionStatus = mapStatus(harness.getStatus());
  let attached = false;
  const detachListener = (): void => {
    attached = false;
    harness.onDisconnected();
  };
  const onPresence = (payload: string): void => {
    const bytes = encoder.encode(payload);
    for (const listener of dataListeners) listener(bytes);
  };

  function setStatus(next: ConnectionStatus): void {
    if (next === status) return;
    const wasConnected = status === "connected";
    status = next;
    // Event handler bound to the live hub connection; re-bind on (re)connect.
    if (next === "connected" && !wasConnected && !attached) {
      attached = true;
      harness.onConnected(onPresence);
    } else if (next !== "connected" && wasConnected && attached) {
      detachListener();
    }
    for (const listener of statusListeners) listener(status);
  }

  const offStatus = harness.subscribeStatus(() => setStatus(mapStatus(harness.getStatus())));

  // Defensive: if the hub is already connected at construction, bind now. The
  // transition path above normally handles this; the `!attached` guard makes a
  // follow-up "connected" fire a no-op (no double-bind).
  if (status === "connected") {
    attached = true;
    harness.onConnected(onPresence);
  }

  const transport: LiveCursorTransport = {
    connect: () => {},
    disconnect: () => {},
    send: async (data) => {
      // Mirror use-signalr's fire-and-forget `send`: dropped while not connected.
      if (status !== "connected") return;
      await harness.send(decoder.decode(data));
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
  };

  const dispose = (): void => {
    offStatus();
    if (attached) detachListener();
    statusListeners.clear();
    dataListeners.clear();
  };

  return { transport, dispose };
}

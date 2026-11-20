import { reportListenerError, warnOnce } from "@anchor-presence/core";
import type { ConnectionStatus, PresenceTransport } from "@anchor-presence/core";

/** A transport that connects and disconnects on demand, with required status members. */
export type BroadcastChannelTransport = PresenceTransport & {
  connect(): void;
  disconnect(): void;
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  getStatus(): ConnectionStatus;
};

function toBytes(value: unknown): Uint8Array | null {
  if (!ArrayBuffer.isView(value)) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/**
 * Creates a `PresenceTransport` over `BroadcastChannel`. It links tabs and iframes of one origin, with no server.
 * Each transport ignores its own messages, so two clients in one tab need two transports.
 * Any script of the same origin can post on the channel, so keep the default shape check on.
 */
export function createBroadcastChannelTransport(channelName: string): BroadcastChannelTransport {
  const selfId = Math.random().toString(36).slice(2);
  const listeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let channel: BroadcastChannel | null = null;
  let status: ConnectionStatus = "disconnected";

  const setStatus = (next: ConnectionStatus): void => {
    status = next;
    for (const listener of statusListeners) {
      try {
        listener(next);
      } catch (error) {
        reportListenerError(error);
      }
    }
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    const message = event.data as { from?: unknown; data?: unknown } | null;
    if (typeof message !== "object" || message === null || message.from === selfId) return;
    const bytes = toBytes(message.data);
    if (bytes === null) return;
    for (const listener of listeners) {
      try {
        listener(bytes);
      } catch (error) {
        reportListenerError(error);
      }
    }
  };

  return {
    connect() {
      if (channel !== null) return;
      channel = new BroadcastChannel(channelName);
      channel.addEventListener("message", onMessage);
      setStatus("connected");
    },
    disconnect() {
      channel?.close();
      channel = null;
      setStatus("disconnected");
    },
    send(data) {
      if (channel === null) {
        warnOnce(
          "broadcast-send-while-disconnected",
          "a BroadcastChannel transport dropped a message because it is not connected.",
        );
        return;
      }
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel has no target origin
      channel.postMessage({ from: selfId, data });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeStatus(listener) {
      listener(status);
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getStatus() {
      return status;
    },
  };
}

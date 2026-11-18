import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";

/** A transport that connects and disconnects on demand. */
export type BroadcastChannelTransport = LiveCursorTransport & {
  connect(): void;
  disconnect(): void;
};

/**
 * Creates a `LiveCursorTransport` over `BroadcastChannel`. It links tabs and iframes of one origin, with no server.
 * Each transport ignores its own messages, so two clients in one tab need two transports.
 */
export function createBroadcastChannelTransport(channelName: string): BroadcastChannelTransport {
  const channel = new BroadcastChannel(channelName);
  const selfId = Math.random().toString(36).slice(2);
  const listeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "disconnected";

  const setStatus = (next: ConnectionStatus): void => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  channel.addEventListener("message", (event: MessageEvent<{ from: string; data: Uint8Array }>) => {
    if (event.data.from === selfId || !ArrayBuffer.isView(event.data.data)) return;
    for (const listener of listeners) listener(event.data.data);
  });

  return {
    connect() {
      setStatus("connected");
    },
    disconnect() {
      channel.close();
      setStatus("disconnected");
    },
    send(data) {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel has no target origin
      if (status === "connected") channel.postMessage({ from: selfId, data });
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

import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";

// BroadcastChannel carries structured-cloned values, not the codec's raw bytes, so length is lost; frame it back.
function toMessage(data: Uint8Array): { bytes: number[] } {
  return { bytes: Array.from(data) };
}

function fromMessage(message: unknown): Uint8Array | null {
  if (
    typeof message === "object" &&
    message !== null &&
    "bytes" in message &&
    Array.isArray((message as { bytes: unknown }).bytes)
  ) {
    return new Uint8Array((message as { bytes: number[] }).bytes);
  }
  return null;
}

/**
 * A `LiveCursorTransport` over `BroadcastChannel`: same-origin, works across iframes and tabs.
 * Every side on the channel receives every message, including its own; pass a distinct
 * `selfId` and each transport ignores messages carrying that id (used to skip echoes).
 */
export function createBroadcastChannelTransport(channelName: string): LiveCursorTransport & {
  connect(): void;
  disconnect(): void;
} {
  const channel = new BroadcastChannel(channelName);
  const selfId = Math.random().toString(36).slice(2);
  const listeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "disconnected";

  const setStatus = (next: ConnectionStatus) => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  channel.addEventListener("message", (event: MessageEvent<{ from: string; bytes: number[] }>) => {
    if (event.data.from === selfId) return;
    const data = fromMessage({ bytes: event.data.bytes });
    if (data) for (const listener of listeners) listener(data);
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
      channel.postMessage({ from: selfId, ...toMessage(data) });
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

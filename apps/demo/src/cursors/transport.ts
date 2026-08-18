// Example WebSocketTransport over the relay in apps/server — deliberately demo code, not part of @anchor-presence/core.
import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";

export type WebSocketTransportOptions = {
  /** Relay port. Defaults to 8787 (apps/server default). */
  port?: number;
  /** Room name. Defaults to the page's ?room= param, else "main". */
  room?: string;
  /** Base backoff in ms before the first reconnect attempt. */
  baseBackoffMs?: number;
  /** Cap on reconnect backoff. */
  maxBackoffMs?: number;
};

function resolveUrl(options: WebSocketTransportOptions): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = options.port ?? 8787;
  const room = options.room ?? new URLSearchParams(window.location.search).get("room") ?? "main";
  return `${protocol}//${host}:${port}/?room=${encodeURIComponent(room)}`;
}

// demo example transport — applications bring their own
export function createWebSocketTransport(options: WebSocketTransportOptions = {}): LiveCursorTransport {
  const url = resolveUrl(options);
  const baseBackoffMs = options.baseBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;

  let socket: WebSocket | null = null;
  let disposed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let status: ConnectionStatus = "connecting";

  const dataListeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer !== null) return;
    setStatus("reconnecting");
    const delay = Math.min(baseBackoffMs * 2 ** reconnectAttempt, maxBackoffMs);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function open(): void {
    if (disposed) return;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    socket = ws;

    ws.addEventListener("open", () => {
      reconnectAttempt = 0;
      setStatus("connected");
    });

    ws.addEventListener("message", (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(event.data);
      for (const listener of dataListeners) listener(bytes);
    });

    ws.addEventListener("close", () => {
      if (socket === ws) socket = null;
      if (disposed) return;
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  return {
    connect() {
      open();
    },

    disconnect() {
      disposed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
      setStatus("disconnected");
    },

    send(data) {
      if (socket?.readyState !== WebSocket.OPEN) return; // lossy by design — spec §5
      socket.send(data);
    },

    subscribe(listener) {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };
}

// oxlint-disable unicorn/prefer-add-event-listener -- WebSocketLike only exposes on* handlers

import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";

export type WebSocketLike = {
  readonly readyState: number; // 1 = OPEN
  onopen: null | (() => void);
  onclose: null | (() => void);
  onerror: null | (() => void);
  onmessage: null | ((event: { data: unknown }) => void);
  binaryType: string;
  bufferedAmount?: number;
  send(data: ArrayBufferView): void;
  close(): void;
};

export type WebSocketCtor = new (url: string) => WebSocketLike;

/** A `LiveCursorTransport` whose `connect`/`disconnect` are always present, not optional. */
export type WebSocketTransport = LiveCursorTransport & {
  connect(): void;
  disconnect(): void;
};

/**
 * Options for `createWebSocketTransport`.
 */
export type WebSocketTransportOptions = {
  /** WebSocket URL. Defaults to `ws(s)://<current host>:<relay port><path>` when omitted. */
  url?: string;
  /** The host used when building the default URL. Default: `window.location.hostname`. */
  host?: string;
  /** The path, including the query. Default: `/`. */
  path?: string;
  /** The relay port used when building the default URL. Default: `8787`. */
  port?: number;
  /**
   * Room token for the relay auth check.
   * The transport URL-encodes the token and adds it to the URL as `token=...`.
   */
  token?: string;
  /** Enables automatic reconnect with exponential backoff. Default `true`. */
  reconnect?: boolean;
  /** Base backoff, in milliseconds, before the first reconnect attempt. Default `500`. */
  baseBackoffMs?: number;
  /** Cap on the reconnect backoff, in milliseconds. Default `8000`. */
  maxBackoffMs?: number;
  /** Returns a value in `[0, 1)` for backoff jitter. Default: `Math.random`. */
  random?: () => number;
  /** A WebSocket constructor to use. Default: `globalThis.WebSocket`. */
  WebSocketCtor?: WebSocketCtor;
};

const WS_CONNECTING = 0;
const WS_OPEN = 1;

function isDev(): boolean {
  try {
    const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env;
    return env?.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

function resolveUrl(options: WebSocketTransportOptions): string {
  if (options.url !== undefined) return options.url;
  const location = window.location;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = options.host ?? location.hostname;
  const port = options.port ?? 8787;
  const path = options.path ?? "/";
  return `${protocol}//${host}:${port}${path}`;
}

function withToken(url: string, token: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

/**
 * Creates a WebSocket transport for the presence relay.
 * The transport reconnects after a connection drop.
 * After `disconnect()`, the transport does not reconnect. Create a new transport.
 * @param options Optional transport settings. Omit to use the defaults.
 * @returns A transport for the client.
 */
export function createWebSocketTransport(options: WebSocketTransportOptions = {}): WebSocketTransport {
  const url =
    options.token !== undefined ? withToken(resolveUrl(options), options.token) : resolveUrl(options);
  const reconnect = options.reconnect ?? true;
  const baseBackoffMs = options.baseBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  const random = options.random ?? Math.random;
  // the real WebSocket does not structurally satisfy WebSocketLike (handler signature variance); cast like the scheduler's ctor injections
  const WebSocketImpl =
    options.WebSocketCtor ?? (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;

  let socket: WebSocketLike | null = null;
  let disposedByUser = false;
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
    if (disposedByUser || reconnectTimer !== null) return;
    setStatus("reconnecting");
    const capped = Math.min(baseBackoffMs * 2 ** reconnectAttempt, maxBackoffMs);
    // full-jitter on a lower bound: spreads reconnect storms without doubling the worst case
    const delay = Math.max(1, Math.round(capped * (0.5 + random() * 0.5)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function open(): void {
    if (disposedByUser || WebSocketImpl === undefined) return;
    // a reconnect or a double connect() must not orphan a live socket: sever and close the previous one
    if (socket !== null) {
      const previous = socket;
      previous.onopen = null;
      previous.onmessage = null;
      previous.onerror = null;
      previous.onclose = null;
      previous.close();
    }
    try {
      const ws = new WebSocketImpl(url);
      ws.binaryType = "arraybuffer";
      socket = ws;

      ws.onopen = () => {
        reconnectAttempt = 0;
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (!(data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(data);
        for (const listener of dataListeners) listener(bytes);
      };

      ws.onclose = () => {
        if (socket === ws) socket = null;
        if (disposedByUser) return;
        if (reconnect) scheduleReconnect();
        else setStatus("disconnected");
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // a throwing constructor (bad URL, blocked host) must not kill the reconnect loop
      if (reconnect) scheduleReconnect();
      else setStatus("disconnected");
    }
  }

  return {
    connect() {
      if (disposedByUser) {
        if (isDev()) {
          console.warn(
            "[anchor-presence] WebSocket transport: connect() after disconnect() is a no-op; create a new transport",
          );
        }
        return;
      }
      // a socket already connecting or open must not be replaced: connect() is idempotent while one is live
      if (socket !== null && (socket.readyState === WS_CONNECTING || socket.readyState === WS_OPEN)) return;
      setStatus("connecting");
      open();
    },

    disconnect() {
      disposedByUser = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
      setStatus("disconnected");
    },

    send(data) {
      if (socket?.readyState !== WS_OPEN) return; // lossy by design — spec §5
      try {
        socket.send(data);
      } catch {
        // swallow send errors — presence is lossy by design
      }
    },

    subscribe(listener) {
      dataListeners.add(listener);
      return () => {
        dataListeners.delete(listener);
      };
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      listener(status);
      return () => {
        statusListeners.delete(listener);
      };
    },

    getStatus() {
      return status;
    },

    bufferedBytes() {
      return socket?.bufferedAmount ?? 0;
    },
  };
}

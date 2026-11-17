// oxlint-disable unicorn/prefer-add-event-listener -- WebSocketLike only exposes on* handlers

import { isDevMode } from "@anchor-presence/core";
import type { ConnectionStatus, LiveCursorTransport, TransportClose } from "@anchor-presence/core";

type Handler<Event> = { bivarianceHack(event: Event): void }["bivarianceHack"];

export type WebSocketLike = {
  readonly readyState: number; // 1 = OPEN
  onopen: null | Handler<unknown>;
  onclose: null | Handler<{ code?: number; reason?: string }>;
  onerror: null | Handler<unknown>;
  onmessage: null | Handler<{ data: unknown }>;
  binaryType: string;
  bufferedAmount?: number;
  send(data: ArrayBufferView<ArrayBuffer>): void;
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
   * A function runs before every connection attempt, so an expiring token stays fresh. It may return a promise.
   */
  token?: string | (() => string | Promise<string>);
  /** Enables automatic reconnect with exponential backoff. Default `true`. */
  reconnect?: boolean;
  /** Base backoff, in milliseconds, before the first reconnect attempt. Default `500`. */
  baseBackoffMs?: number;
  /** Cap on the reconnect backoff, in milliseconds. Default `8000`. */
  maxBackoffMs?: number;
  /** Returns a value in `[0, 1)` for backoff jitter. Default: `Math.random`. */
  random?: () => number;
  /** How long a connection must stay open before the backoff resets, in milliseconds. Default `5000`. */
  stableAfterMs?: number;
  /** Return `false` to stop reconnecting after a close. Default: reconnect unless the close code is 1008, 4004 (origin) or 4006 (auth). */
  shouldReconnect?: (close: { code?: number; reason?: string }) => boolean;
  /** A WebSocket constructor to use. Default: `globalThis.WebSocket`. */
  WebSocketCtor?: WebSocketCtor;
};

const NO_RETRY_CODES = new Set([1008, 4004, 4006]);
const WS_CONNECTING = 0;
const WS_OPEN = 1;

function resolveUrl(options: WebSocketTransportOptions): string {
  if (options.url !== undefined) return options.url;
  if (typeof window === "undefined") {
    throw new TypeError("createWebSocketTransport: pass `url` when `window` is not available");
  }
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
  const baseUrl = resolveUrl(options);
  const tokenSource = options.token;
  const reconnect = options.reconnect ?? true;
  const baseBackoffMs = options.baseBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  const random = options.random ?? Math.random;
  const stableAfterMs = options.stableAfterMs ?? 5_000;
  const shouldReconnect =
    options.shouldReconnect ?? ((close) => close.code === undefined || !NO_RETRY_CODES.has(close.code));
  const WebSocketImpl = options.WebSocketCtor ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;

  let socket: WebSocketLike | null = null;
  let disposedByUser = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let status: ConnectionStatus = "connecting";

  const dataListeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const closeListeners = new Set<(close: TransportClose) => void>();

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  }

  function clearStableTimer(): void {
    if (stableTimer !== null) clearTimeout(stableTimer);
    stableTimer = null;
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

  function nextUrl(): string | Promise<string> {
    if (tokenSource === undefined) return baseUrl;
    if (typeof tokenSource === "string") return withToken(baseUrl, tokenSource);
    const token = tokenSource();
    return typeof token === "string"
      ? withToken(baseUrl, token)
      : token.then((value) => withToken(baseUrl, value));
  }

  function failConnect(): void {
    if (reconnect) scheduleReconnect();
    else setStatus("disconnected");
  }

  let openAttempt = 0;

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
    let target: string | Promise<string>;
    try {
      target = nextUrl();
    } catch {
      failConnect();
      return;
    }
    const attempt = ++openAttempt;
    if (typeof target === "string") {
      connectTo(target);
    } else {
      target.then(
        (resolved) => {
          if (attempt === openAttempt && !disposedByUser) connectTo(resolved);
        },
        () => {
          if (attempt === openAttempt && !disposedByUser) failConnect();
        },
      );
    }
  }

  function connectTo(url: string): void {
    if (WebSocketImpl === undefined) return;
    try {
      const ws = new WebSocketImpl(url);
      ws.binaryType = "arraybuffer";
      socket = ws;

      ws.onopen = () => {
        clearStableTimer();
        // a relay that accepts then rejects must not reset the backoff on every open
        stableTimer = setTimeout(() => {
          reconnectAttempt = 0;
        }, stableAfterMs);
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (!(data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(data);
        for (const listener of dataListeners) listener(bytes);
      };

      ws.onclose = (event) => {
        clearStableTimer();
        if (socket === ws) socket = null;
        if (disposedByUser) return;
        const willReconnect = reconnect && shouldReconnect(event);
        const closeInfo: TransportClose = { willReconnect };
        if (event.code !== undefined) closeInfo.code = event.code;
        if (event.reason) closeInfo.reason = event.reason;
        for (const listener of closeListeners) {
          try {
            listener(closeInfo);
          } catch {
            // a throwing listener must not stop the reconnect
          }
        }
        if (willReconnect) scheduleReconnect();
        else setStatus("disconnected");
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // a throwing constructor (bad URL, blocked host) must not kill the reconnect loop
      failConnect();
    }
  }

  return {
    connect() {
      if (disposedByUser) {
        if (isDevMode()) {
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
      clearStableTimer();
      socket?.close();
      socket = null;
      setStatus("disconnected");
    },

    send(data) {
      if (socket?.readyState !== WS_OPEN) return; // lossy by design — spec §5
      try {
        socket.send(data as Uint8Array<ArrayBuffer>); // the codec never hands out shared buffers
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

    subscribeClose(listener) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
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

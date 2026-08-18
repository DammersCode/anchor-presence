import type { CursorCodec } from "./codec";
import { jsonCodec } from "./codec";
import { DEFAULT_MAX_MESSAGE_BYTES } from "./protocol";
import type { ConnectionStatus, CursorPosition, CursorPresence } from "./protocol";
import { DEFAULT_STALE_TIMEOUT_MS, RemotePresenceStore } from "./store";
import type { LiveCursorTransport } from "./transport";
import { validatePresence } from "./validate";
import type { ValidationLimits } from "./validate";

export const DEFAULT_PUBLISH_INTERVAL_MS = 50;
export const DEFAULT_HEARTBEAT_MS = 10_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export type SchedulerLike = {
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

export type PresenceClientOptions<TContext = unknown, TUser = unknown> = {
  transport: LiveCursorTransport;
  codec?: CursorCodec;
  clientId?: string;
  publishIntervalMs?: number;
  staleTimeoutMs?: number;
  heartbeatMs?: number;
  maxRemoteClients?: number;
  user?: TUser;
  context?: TContext;
  idFactory?: () => string;
  now?: () => number;
  scheduler?: SchedulerLike;
  validationLimits?: ValidationLimits;
};

export interface PresenceClient<TContext = unknown, TUser = unknown> {
  readonly clientId: string;
  readonly session: string;
  updateLocalCursor(cursor: CursorPosition | null): void;
  setContext(context: TContext | undefined): void;
  setUser(user: TUser | undefined): void;
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void) : () => void;
  getRemoteSnapshot(): CursorPresence<TContext, TUser>[];
  subscribeRemote(listener: () => void): () => void;
  registerTeardown(fn: () => void): void;
  dispose(): void;
}

const defaultScheduler: SchedulerLike = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function defaultIdFactory(): string {
  // randomUUID is secure-context-only; getRandomValues also works on plain http
  const cryptoObj = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof cryptoObj?.randomUUID === "function") return cryptoObj.randomUUID();
  if (typeof cryptoObj?.getRandomValues === "function") {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createPresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientOptions<TContext, TUser>,
): PresenceClient<TContext, TUser> {
  const {
    transport,
    codec = jsonCodec,
    publishIntervalMs = DEFAULT_PUBLISH_INTERVAL_MS,
    staleTimeoutMs,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    maxRemoteClients,
    idFactory = defaultIdFactory,
    now = () => Date.now(),
    scheduler = defaultScheduler,
    validationLimits,
  } = options;

  const clientId = options.clientId ?? idFactory();
  const session = idFactory();

  let context = options.context;
  let user = options.user;
  let sequence = 0;
  let disposed = false;

  let latestCursor: CursorPosition | null = null;
  let lastSentCursor: CursorPosition | null | undefined; // undefined = nothing sent yet
  let publishTimer: TimerHandle | null = null;
  let heartbeatTimer: TimerHandle | null = null;
  let sweepTimer: TimerHandle | null = null;

  let status: ConnectionStatus = transport.subscribeStatus ? "connecting" : "connected";
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const store = new RemotePresenceStore<TContext, TUser>({
    ...(maxRemoteClients !== undefined ? { maxRemoteClients } : {}),
    ...(staleTimeoutMs !== undefined ? { staleTimeoutMs } : {}),
    now,
  });

  const teardowns: Array<() => void> = [];

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    const wasSendable = status !== "connecting" && status !== "disconnected";
    status = next;
    for (const listener of statusListeners) listener(status);
    // reconnected: the latest local state was never sent while unsendable, republish now (rate-limited)
    if (!wasSendable && status === "connected" && latestCursor !== lastSentCursor) {
      schedulePublish();
    }
  }

  function buildMessage(cursor: CursorPosition | null): CursorPresence<TContext, TUser> {
    const message: CursorPresence<TContext, TUser> = {
      version: 1,
      clientId,
      session,
      sequence: sequence++,
      cursor,
    };
    if (context !== undefined) message.context = context;
    if (user !== undefined) message.user = user;
    return message;
  }

  function send(cursor: CursorPosition | null): boolean {
    if (status === "disconnected" || status === "connecting") return false;
    try {
      const bytes = codec.encode(buildMessage(cursor));
      const result = transport.send(bytes);
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
      return true;
    } catch {
      // swallow send errors — presence is lossy by design
      return false;
    }
  }

  function schedulePublish(): void {
    if (disposed || publishTimer !== null) return;
    publishTimer = scheduler.setTimeout(() => {
      publishTimer = null;
      if (latestCursor !== lastSentCursor && send(latestCursor)) {
        lastSentCursor = latestCursor;
      }
    }, publishIntervalMs);
  }

  function scheduleHeartbeat(): void {
    if (disposed) return;
    heartbeatTimer = scheduler.setTimeout(() => {
      send(lastSentCursor ?? null);
      scheduleHeartbeat();
    }, heartbeatMs);
  }
  scheduleHeartbeat();

  const sweepIntervalMs = (staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS) / 2;
  function scheduleSweep(): void {
    if (disposed) return;
    sweepTimer = scheduler.setTimeout(() => {
      store.sweep();
      scheduleSweep();
    }, sweepIntervalMs);
  }
  scheduleSweep();

  const maxMessageBytes = validationLimits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  const unsubscribeTransport = transport.subscribe((data) => {
    if (disposed) return;
    if (data.byteLength > maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
    const decoded = codec.decode(data);
    const presence = validatePresence<TContext, TUser>(decoded, validationLimits);
    if (presence === null) return;
    if (presence.clientId === clientId) return; // ignore echoes of our own messages
    store.ingest(presence);
  });
  teardowns.push(unsubscribeTransport);

  if (transport.subscribeStatus) {
    const unsubscribeStatus = transport.subscribeStatus((next) => setStatus(next));
    teardowns.push(unsubscribeStatus);
  }

  return {
    clientId,
    session,

    updateLocalCursor(cursor) {
      if (disposed) return;
      latestCursor = cursor;
      schedulePublish();
    },

    setContext(next) {
      context = next;
    },

    setUser(next) {
      user = next;
    },

    getStatus() {
      return status;
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },

    getRemoteSnapshot() {
      return store.getSnapshot();
    },

    subscribeRemote(listener) {
      return store.subscribe(listener);
    },

    registerTeardown(fn) {
      teardowns.push(fn);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (publishTimer !== null) scheduler.clearTimeout(publishTimer);
      if (heartbeatTimer !== null) scheduler.clearTimeout(heartbeatTimer);
      if (sweepTimer !== null) scheduler.clearTimeout(sweepTimer);
      publishTimer = null;
      heartbeatTimer = null;
      sweepTimer = null;
      statusListeners.clear();
      for (const teardown of teardowns.splice(0, teardowns.length)) {
        teardown();
      }
    },
  };
}

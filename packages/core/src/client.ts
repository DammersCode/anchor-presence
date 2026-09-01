import type { CursorCodec } from "./codec";
import { jsonCodec } from "./codec";
import { DEFAULT_MAX_FIELD_BYTES, DEFAULT_MAX_MESSAGE_BYTES } from "./protocol";
import type {
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  PointerInfo,
} from "./protocol";
import { DEFAULT_STALE_TIMEOUT_MS, RemotePresenceStore } from "./store";
import type { LiveCursorTransport } from "./transport";
import { validatePresence } from "./validate";
import type { ValidationLimits } from "./validate";

export const DEFAULT_PUBLISH_INTERVAL_MS = 50;
export const DEFAULT_HEARTBEAT_MS = 10_000;

const MIN_TIMER_INTERVAL_MS = 1;
const MIN_STALE_TIMEOUT_MS = 1000;

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
  updateLocalCursor(cursor: CursorPosition | null, pointer?: PointerInfo): void;
  setContext(context: TContext | undefined): void;
  getContext(): TContext | undefined;
  setUser(user: TUser | undefined): void;
  getUser(): TUser | undefined;
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  getRemoteSnapshot(): CursorPresence<TContext, TUser>[];
  subscribeRemote(listener: () => void): () => void;
  /** Returns an unregister function; on an already-disposed client runs fn immediately. */
  registerTeardown(fn: () => void): () => void;
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

function isDevMode(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env;
  return env?.NODE_ENV !== "production";
}

function jsonByteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : new TextEncoder().encode(json).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function createPresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientOptions<TContext, TUser>,
): PresenceClient<TContext, TUser> {
  const {
    transport,
    codec = jsonCodec,
    maxRemoteClients,
    idFactory = defaultIdFactory,
    now = () => Date.now(),
    scheduler = defaultScheduler,
    validationLimits,
  } = options;

  const publishIntervalMs = Math.max(
    MIN_TIMER_INTERVAL_MS,
    options.publishIntervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS,
  );
  const heartbeatMs = Math.max(MIN_TIMER_INTERVAL_MS, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  const staleTimeoutMs =
    options.staleTimeoutMs === undefined
      ? undefined
      : Math.max(MIN_STALE_TIMEOUT_MS, options.staleTimeoutMs);

  const clientId = options.clientId ?? idFactory();
  const session = idFactory();

  let context = options.context;
  let user = options.user;
  let sequence = 0;
  let disposed = false;

  let latestCursor: CursorPosition | null = null;
  let latestPointer: PointerInfo | undefined;
  let pendingPublish = false;
  let publishTimer: TimerHandle | null = null;
  let heartbeatTimer: TimerHandle | null = null;
  let sweepTimer: TimerHandle | null = null;

  let status: ConnectionStatus = transport.subscribeStatus
    ? (transport.getStatus?.() ?? "connecting")
    : "connected";
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const store = new RemotePresenceStore<TContext, TUser>({
    ...(maxRemoteClients !== undefined ? { maxRemoteClients } : {}),
    ...(staleTimeoutMs !== undefined ? { staleTimeoutMs } : {}),
    now,
  });

  const teardowns: Array<() => void> = [];

  const maxFieldBytes = validationLimits?.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES;
  const maxMessageBytes = validationLimits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  const devMode = isDevMode();

  // checked when context/user changes, not per message — receivers silently drop oversized fields
  function warnIfOversized(): void {
    if (!devMode) return;
    try {
      if (context !== undefined && jsonByteLength(context) > maxFieldBytes) {
        console.warn(
          `[anchor-presence] outbound context exceeds maxFieldBytes (${maxFieldBytes}); receivers will drop the field`,
        );
      }
      if (user !== undefined && jsonByteLength(user) > maxFieldBytes) {
        console.warn(
          `[anchor-presence] outbound user exceeds maxFieldBytes (${maxFieldBytes}); receivers will drop the field`,
        );
      }
      const probe: CursorPresence<TContext, TUser> = {
        version: 1,
        clientId,
        session,
        sequence,
        cursor: latestCursor,
      };
      if (context !== undefined) probe.context = context;
      if (user !== undefined) probe.user = user;
      if (codec.encode(probe).byteLength > maxMessageBytes) {
        console.warn(
          `[anchor-presence] outbound message exceeds maxMessageBytes (${maxMessageBytes}); receivers will drop it`,
        );
      }
    } catch {
      // the sizing probe must never break the client
    }
  }

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    // republish before listener fan-out so a throwing listener cannot kill the guarantee
    if (status === "connected") {
      pendingPublish = true;
      schedulePublish();
    }
    for (const listener of statusListeners) {
      try {
        listener(status);
      } catch {
        // one throwing listener must not starve the rest
      }
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
    if (latestPointer !== undefined) message.pointer = latestPointer;
    return message;
  }

  function send(cursor: CursorPosition | null): boolean {
    if (status !== "connected") return false;
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
      if (!pendingPublish) return;
      if (send(latestCursor)) {
        pendingPublish = false;
      } else if (status === "connected") {
        schedulePublish(); // transient send failure: retry instead of stalling until the next change
      }
      // while unsendable, pendingPublish stays set; the transition into "connected" re-schedules
    }, publishIntervalMs);
  }

  function markPending(): void {
    pendingPublish = true;
    schedulePublish();
  }

  function scheduleHeartbeat(): void {
    if (disposed) return;
    heartbeatTimer = scheduler.setTimeout(() => {
      if (send(latestCursor)) pendingPublish = false;
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

  const unsubscribeTransport = transport.subscribe((data) => {
    if (disposed) return;
    try {
      if (data.byteLength > maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
      const decoded = codec.decode(data);
      const presence = validatePresence<TContext, TUser>(decoded, validationLimits);
      if (presence === null) return;
      if (presence.clientId === clientId) return; // ignore echoes of our own messages
      store.ingest(presence);
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  teardowns.push(unsubscribeTransport);

  if (transport.subscribeStatus) {
    const unsubscribeStatus = transport.subscribeStatus((next) => setStatus(next));
    teardowns.push(unsubscribeStatus);
  }

  if (context !== undefined || user !== undefined) warnIfOversized();

  return {
    clientId,
    session,

    updateLocalCursor(cursor, pointer) {
      if (disposed) return;
      latestCursor = cursor;
      if (pointer !== undefined) latestPointer = pointer;
      markPending();
    },

    setContext(next) {
      if (disposed) return;
      context = next;
      warnIfOversized();
      markPending();
    },

    getContext() {
      return context;
    },

    setUser(next) {
      if (disposed) return;
      user = next;
      warnIfOversized();
      markPending();
    },

    getUser() {
      return user;
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
      if (disposed) {
        fn();
        return () => {};
      }
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      send(null); // best-effort leave message so receivers hide the cursor immediately
      if (publishTimer !== null) scheduler.clearTimeout(publishTimer);
      if (heartbeatTimer !== null) scheduler.clearTimeout(heartbeatTimer);
      if (sweepTimer !== null) scheduler.clearTimeout(sweepTimer);
      publishTimer = null;
      heartbeatTimer = null;
      sweepTimer = null;
      if (status !== "disconnected") {
        status = "disconnected";
        for (const listener of statusListeners) {
          try {
            listener(status);
          } catch {
            // one throwing listener must not starve the rest
          }
        }
      }
      statusListeners.clear();
      for (const teardown of teardowns.splice(0, teardowns.length)) {
        teardown();
      }
    },
  };
}

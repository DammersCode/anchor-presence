import type { CursorCodec } from "./codec";
import { jsonCodec } from "./codec";
import { DEFAULT_MAX_FIELD_BYTES, DEFAULT_MAX_MESSAGE_BYTES } from "./protocol";
import type {
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  PointerInfo,
  RemotePresence,
} from "./protocol";
import { DEFAULT_MAX_REMOTE_CLIENTS, DEFAULT_STALE_TIMEOUT_MS, RemotePresenceStore } from "./store";
import type { LiveCursorTransport } from "./transport";
import { validatePresence } from "./validate";
import type { ValidationLimits } from "./validate";

/** Default publish interval, in milliseconds. */
export const DEFAULT_PUBLISH_INTERVAL_MS = 50;

/** Default heartbeat interval, in milliseconds. */
export const DEFAULT_HEARTBEAT_MS = 10_000;

const MIN_TIMER_INTERVAL_MS = 1;
const MIN_STALE_TIMEOUT_MS = 1000;
const PUBLISH_RETRY_INITIAL_MS = 50;
const PUBLISH_RETRY_MAX_MS = 2000;

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Timer functions the client uses for its schedules.
 * Tests can provide a fake timer here.
 */
export type SchedulerLike = {
  /** Sets a timer and returns its handle. */
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
  /** Clears one timer. */
  clearTimeout: (handle: TimerHandle) => void;
};

/**
 * Options for the adaptive publish rate.
 * The client lowers the publish rate while the transport holds many bytes.
 */
export type AdaptivePublishOptions = {
  /** Buffered bytes that turn on slow mode. Default `64 KiB`. */
  highWatermarkBytes?: number;
  /** Buffered bytes that turn off slow mode. Default half of `highWatermarkBytes`. */
  lowWatermarkBytes?: number;
  /** Publish interval in slow mode, in milliseconds. Default `max(publishIntervalMs * 4, 100)`. */
  slowPublishIntervalMs?: number;
};

/**
 * Options for `createPresenceClient`.
 * Only `transport` is required.
 */
export type PresenceClientOptions<TContext = unknown, TUser = unknown> = {
  /** The transport the client sends and receives over. */
  transport: LiveCursorTransport;
  /** The codec for message bytes. Default `jsonCodec`. */
  codec?: CursorCodec;
  /** A stable ID for this client. Default: a new random ID. */
  clientId?: string;
  /** Publish interval, in milliseconds. Default `DEFAULT_PUBLISH_INTERVAL_MS`. */
  publishIntervalMs?: number;
  /** Time before a remote client counts as stale, in milliseconds. Minimum `1000`. */
  staleTimeoutMs?: number;
  /** Heartbeat interval, in milliseconds. Default `DEFAULT_HEARTBEAT_MS`. */
  heartbeatMs?: number;
  /** Maximum remote clients in the store. Default `DEFAULT_MAX_REMOTE_CLIENTS`. */
  maxRemoteClients?: number;
  /** Runs when the store drops a new `clientId` because the store is full. */
  onRemoteClientDrop?: () => void;
  /** The user value the client sends to remote peers. */
  user?: TUser;
  /** The context value the client sends to remote peers. */
  context?: TContext;
  /** Returns a new random ID. The client uses it for `clientId` and `session`. */
  idFactory?: () => string;
  /** Returns the current time in milliseconds. Default `Date.now`. */
  now?: () => number;
  /** The timer surface for the client schedules. Default: the global timers. */
  scheduler?: SchedulerLike;
  /** Limits for inbound messages. Default: the protocol defaults. */
  validationLimits?: ValidationLimits;
  /** Settings for the adaptive publish rate. Omit to keep the fixed rate. */
  adaptivePublish?: AdaptivePublishOptions;
};

/**
 * The public surface of one presence client.
 */
export interface PresenceClient<TContext = unknown, TUser = unknown> {
  /** The stable ID of this client. */
  readonly clientId: string;
  /** The session ID of this client. */
  readonly session: string;
  /**
   * Sets the local cursor position.
   * The client sends the position to remote peers.
   * A `null` value clears the cursor for remote peers.
   * @param cursor The new position, or `null` to clear it.
   * @param pointer Optional pointer info to send with the cursor.
   */
  updateLocalCursor(cursor: CursorPosition | null, pointer?: PointerInfo): void;
  /**
   * Sets the context value the client sends to remote peers.
   * `undefined` clears the value.
   */
  setContext(context: TContext | undefined): void;
  /** Returns the local context value. */
  getContext(): TContext | undefined;
  /**
   * Adds a listener for local context changes.
   * The client calls the listener on every `setContext`.
   * @returns A function that removes the listener.
   */
  subscribeContext(listener: () => void): () => void;
  /**
   * Sets the user value the client sends to remote peers.
   * `undefined` clears the value.
   */
  setUser(user: TUser | undefined): void;
  /** Returns the local user value. */
  getUser(): TUser | undefined;
  /** Returns the current connection status. */
  getStatus(): ConnectionStatus;
  /**
   * Adds a listener for connection status changes.
   * @returns A function that removes the listener.
   */
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  /**
   * Returns the raw remote snapshot, including `sequence`.
   * The client returns a new array when it accepts a message.
   */
  getRemoteSnapshot(): CursorPresence<TContext, TUser>[];
  /**
   * Returns the stable remote snapshot, without `sequence`.
   * The client keeps the array identity while nothing observable changes.
   * Use this for rendering. Use `getRemoteSnapshot()` to watch `sequence`.
   */
  getRemotePresence(): RemotePresence<TContext, TUser>[];
  /**
   * Adds a listener for remote presence changes.
   * The client calls the listener when it accepts a message.
   * @returns A function that removes the listener.
   */
  subscribeRemote(listener: () => void): () => void;
  /**
   * Registers a function to run on `dispose`.
   * If the client is already disposed, the client runs the function at once.
   * @param fn The function to run on dispose.
   * @returns A function that unregisters `fn`.
   */
  registerTeardown(fn: () => void): () => void;
  /**
   * Stops the client and clears its listeners.
   * The client sends a final clear message when it can.
   */
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

// Minimal DOM surface; core builds without the DOM lib so this stays a structural type.
type DocumentLike = {
  readonly visibilityState: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
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

/**
 * Creates one presence client.
 * The client sends and receives messages through the transport you give it.
 * @param options The client options. `transport` is required.
 * @returns The client.
 */
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
  const adaptiveOptions = options.adaptivePublish;
  const highWatermarkBytes = Math.max(
    0,
    adaptiveOptions?.highWatermarkBytes ?? 64 * 1024,
  );
  const lowWatermarkBytes = Math.max(
    0,
    Math.min(
      adaptiveOptions?.lowWatermarkBytes ?? highWatermarkBytes / 2,
      highWatermarkBytes,
    ),
  );
  const slowPublishIntervalMs = Math.max(
    MIN_TIMER_INTERVAL_MS,
    adaptiveOptions?.slowPublishIntervalMs ?? Math.max(publishIntervalMs * 4, 100),
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
  let contextDirty = context !== undefined;
  let userDirty = user !== undefined;
  let sequence = 0;
  let disposed = false;

  let latestCursor: CursorPosition | null = null;
  let latestPointer: PointerInfo | undefined;
  let pendingPublish = false;
  let pendingFullPublish = false;
  let failedSendCount = 0;
  let slowMode = false;
  let publishTimer: TimerHandle | null = null;
  let heartbeatTimer: TimerHandle | null = null;
  let sweepTimer: TimerHandle | null = null;

  let status: ConnectionStatus = transport.subscribeStatus
    ? (transport.getStatus?.() ?? "connecting")
    : "connected";
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const contextListeners = new Set<() => void>();

  const devMode = isDevMode();
  let warnedAboutRemoteCap = false;
  const store = new RemotePresenceStore<TContext, TUser>({
    ...(maxRemoteClients !== undefined ? { maxRemoteClients } : {}),
    ...(staleTimeoutMs !== undefined ? { staleTimeoutMs } : {}),
    now,
    onDropNewClient: () => {
      if (devMode && !warnedAboutRemoteCap) {
        warnedAboutRemoteCap = true;
        console.warn(
          `[anchor-presence] remote presence store is full (maxRemoteClients=${maxRemoteClients ?? DEFAULT_MAX_REMOTE_CLIENTS}); new clientIds are dropped until an entry expires`,
        );
      }
      try {
        options.onRemoteClientDrop?.();
      } catch {
        // a throwing callback must not break the inbound pipeline
      }
    },
  });

  const teardowns: Array<() => void> = [];

  const maxFieldBytes = validationLimits?.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES;
  const maxMessageBytes = validationLimits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;

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
      pendingFullPublish = true;
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

  function buildMessage(cursor: CursorPosition | null, includeFull: boolean): CursorPresence<TContext, TUser> {
    const message: CursorPresence<TContext, TUser> = {
      version: 1,
      clientId,
      session,
      sequence: sequence++,
      cursor,
    };
    if (contextDirty || includeFull) message.context = context ?? null;
    if (userDirty || includeFull) message.user = user ?? null;
    if (latestPointer !== undefined) message.pointer = latestPointer;
    return message;
  }

  function updateSlowMode(): void {
    if (adaptiveOptions === undefined || typeof transport.bufferedBytes !== "function") return;
    try {
      const buffered = transport.bufferedBytes();
      if (buffered >= highWatermarkBytes) slowMode = true;
      else if (buffered <= lowWatermarkBytes) slowMode = false;
    } catch {
      // a throwing transport probe must not break publishing
    }
  }

  function send(cursor: CursorPosition | null, includeFull = false): boolean {
    if (status !== "connected") return false;
    try {
      const message = buildMessage(cursor, includeFull);
      const bytes = codec.encode(message);
      const result = transport.send(bytes);
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
      updateSlowMode();
      if (message.context !== undefined) contextDirty = false;
      if (message.user !== undefined) userDirty = false;
      return true;
    } catch {
      // swallow send errors — presence is lossy by design
      return false;
    }
  }

  function schedulePublish(retryDelayMs?: number): void {
    if (disposed || publishTimer !== null) return;
    const interval = retryDelayMs ?? (slowMode ? slowPublishIntervalMs : publishIntervalMs);
    publishTimer = scheduler.setTimeout(() => {
      publishTimer = null;
      if (!pendingPublish) return;
      if (send(latestCursor, pendingFullPublish)) {
        pendingPublish = false;
        pendingFullPublish = false;
        failedSendCount = 0;
      } else if (status === "connected") {
        // transient send failure: retry on an exponential backoff instead of hammering a dead transport
        const delay = Math.min(PUBLISH_RETRY_INITIAL_MS * 2 ** failedSendCount, PUBLISH_RETRY_MAX_MS);
        failedSendCount += 1;
        schedulePublish(delay);
      }
      // while unsendable, pendingPublish stays set; the transition into "connected" re-schedules
    }, interval);
  }

  function markPending(): void {
    pendingPublish = true;
    schedulePublish();
  }

  function scheduleHeartbeat(): void {
    if (disposed) return;
    heartbeatTimer = scheduler.setTimeout(() => {
      if (send(latestCursor, true)) pendingPublish = false;
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

  // browser-only: flush a pending publish as soon as the page becomes visible again
  const browserDocument = (globalThis as { document?: DocumentLike }).document;
  if (browserDocument !== undefined && typeof browserDocument.addEventListener === "function") {
    const onVisibilityChange = () => {
      if (disposed || browserDocument.visibilityState !== "visible" || !pendingPublish) return;
      if (send(latestCursor, pendingFullPublish)) {
        pendingPublish = false;
        pendingFullPublish = false;
        failedSendCount = 0;
      }
    };
    browserDocument.addEventListener("visibilitychange", onVisibilityChange);
    teardowns.push(() => browserDocument.removeEventListener("visibilitychange", onVisibilityChange));
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
      if (context === next) return;
      context = next;
      contextDirty = true;
      warnIfOversized();
      markPending();
      for (const listener of contextListeners) {
        try {
          listener();
        } catch {
          // one throwing listener must not starve the rest
        }
      }
    },

    getContext() {
      return context;
    },

    subscribeContext(listener) {
      contextListeners.add(listener);
      return () => {
        contextListeners.delete(listener);
      };
    },

    setUser(next) {
      if (disposed) return;
      if (user === next) return;
      user = next;
      userDirty = true;
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

    getRemotePresence() {
      return store.getStableSnapshot();
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
      contextListeners.clear();
      for (const teardown of teardowns.splice(0)) {
        teardown();
      }
    },
  };
}

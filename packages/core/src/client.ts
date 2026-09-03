import type { CursorCodec } from "./codec";
import { jsonCodec } from "./codec";
import { createOversizedWarning, isDevMode } from "./internal/devWarnings";
import { defaultIdFactory } from "./internal/ids";
import { createPublishLoop } from "./internal/publishLoop";
import type { PresenceClientState, SchedulerLike } from "./internal/types";
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

export type { SchedulerLike };

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

  const status = transport.subscribeStatus
    ? (transport.getStatus?.() ?? "connecting")
    : "connected";
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

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

  const state: PresenceClientState<TContext, TUser> = {
    transport,
    codec,
    scheduler,
    clientId,
    session,
    publishIntervalMs,
    slowPublishIntervalMs,
    highWatermarkBytes,
    lowWatermarkBytes,
    adaptivePublish: adaptiveOptions !== undefined,
    heartbeatMs,
    sweepIntervalMs: (staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS) / 2,
    maxFieldBytes: validationLimits?.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES,
    maxMessageBytes: validationLimits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    validationLimits,
    devMode,
    store,
    context: options.context,
    user: options.user,
    contextDirty: options.context !== undefined,
    userDirty: options.user !== undefined,
    sequence: 0,
    disposed: false,
    latestCursor: null,
    latestPointer: undefined,
    pendingPublish: false,
    pendingFullPublish: false,
    failedSendCount: 0,
    slowMode: false,
    publishTimer: null,
    heartbeatTimer: null,
    sweepTimer: null,
    status,
    contextListeners: new Set(),
    teardowns: [],
  };

  const warnIfOversized = createOversizedWarning(state);

  const publish = createPublishLoop(state);

  function setStatus(next: ConnectionStatus): void {
    if (state.status === next) return;
    state.status = next;
    // republish before listener fan-out so a throwing listener cannot kill the guarantee
    if (state.status === "connected") {
      publish.markReconnected();
    }
    for (const listener of statusListeners) {
      try {
        listener(state.status);
      } catch {
        // one throwing listener must not starve the rest
      }
    }
  }

  function scheduleHeartbeat(): void {
    if (state.disposed) return;
    state.heartbeatTimer = state.scheduler.setTimeout(() => {
      publish.sendHeartbeat();
      scheduleHeartbeat();
    }, state.heartbeatMs);
  }
  scheduleHeartbeat();

  function scheduleSweep(): void {
    if (state.disposed) return;
    state.sweepTimer = state.scheduler.setTimeout(() => {
      state.store.sweep();
      scheduleSweep();
    }, state.sweepIntervalMs);
  }
  scheduleSweep();

  const unsubscribeTransport = transport.subscribe((data) => {
    if (state.disposed) return;
    try {
      if (data.byteLength > state.maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
      const decoded = state.codec.decode(data);
      const presence = validatePresence<TContext, TUser>(decoded, state.validationLimits);
      if (presence === null) return;
      if (presence.clientId === state.clientId) return; // ignore echoes of our own messages
      state.store.ingest(presence);
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  state.teardowns.push(unsubscribeTransport);

  if (transport.subscribeStatus) {
    const unsubscribeStatus = transport.subscribeStatus((next) => setStatus(next));
    state.teardowns.push(unsubscribeStatus);
  }

  publish.wireVisibility();

  if (state.context !== undefined || state.user !== undefined) warnIfOversized();

  return {
    clientId,
    session,

    updateLocalCursor(cursor, pointer) {
      if (state.disposed) return;
      state.latestCursor = cursor;
      if (pointer !== undefined) state.latestPointer = pointer;
      publish.markPending();
    },

    setContext(next) {
      if (state.disposed) return;
      if (state.context === next) return;
      state.context = next;
      state.contextDirty = true;
      warnIfOversized();
      publish.markPending();
      for (const listener of state.contextListeners) {
        try {
          listener();
        } catch {
          // one throwing listener must not starve the rest
        }
      }
    },

    getContext() {
      return state.context;
    },

    subscribeContext(listener) {
      state.contextListeners.add(listener);
      return () => {
        state.contextListeners.delete(listener);
      };
    },

    setUser(next) {
      if (state.disposed) return;
      if (state.user === next) return;
      state.user = next;
      state.userDirty = true;
      warnIfOversized();
      publish.markPending();
    },

    getUser() {
      return state.user;
    },

    getStatus() {
      return state.status;
    },

    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },

    getRemoteSnapshot() {
      return state.store.getSnapshot();
    },

    getRemotePresence() {
      return state.store.getStableSnapshot();
    },

    subscribeRemote(listener) {
      return state.store.subscribe(listener);
    },

    registerTeardown(fn) {
      if (state.disposed) {
        fn();
        return () => {};
      }
      state.teardowns.push(fn);
      return () => {
        const index = state.teardowns.indexOf(fn);
        if (index !== -1) state.teardowns.splice(index, 1);
      };
    },

    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      publish.send(null); // best-effort leave message so receivers hide the cursor immediately
      if (state.publishTimer !== null) scheduler.clearTimeout(state.publishTimer);
      if (state.heartbeatTimer !== null) scheduler.clearTimeout(state.heartbeatTimer);
      if (state.sweepTimer !== null) scheduler.clearTimeout(state.sweepTimer);
      state.publishTimer = null;
      state.heartbeatTimer = null;
      state.sweepTimer = null;
      if (state.status !== "disconnected") {
        state.status = "disconnected";
        for (const listener of statusListeners) {
          try {
            listener(state.status);
          } catch {
            // one throwing listener must not starve the rest
          }
        }
      }
      statusListeners.clear();
      state.contextListeners.clear();
      for (const teardown of state.teardowns.splice(0)) {
        teardown();
      }
    },
  };
}

import { jsonCodec } from "./codec";
import { createOversizedWarning, isDevMode } from "./internal/devWarnings";
import { defaultIdFactory } from "./internal/ids";
import { createPublishLoop } from "./internal/publishLoop";
import { createStatusMachine } from "./internal/reconnect";
import type {
  PresenceClient,
  PresenceClientOptions,
  PresenceClientState,
  SchedulerLike,
} from "./internal/types";
import { DEFAULT_MAX_FIELD_BYTES, DEFAULT_MAX_MESSAGE_BYTES } from "./protocol";
import { DEFAULT_MAX_REMOTE_CLIENTS, DEFAULT_STALE_TIMEOUT_MS, RemotePresenceStore } from "./store";
import { validatePresence } from "./validate";

/** Default publish interval, in milliseconds. */
export const DEFAULT_PUBLISH_INTERVAL_MS = 50;

/** Default heartbeat interval, in milliseconds. */
export const DEFAULT_HEARTBEAT_MS = 10_000;

const MIN_TIMER_INTERVAL_MS = 1;
const MIN_STALE_TIMEOUT_MS = 1000;

export type {
  AdaptivePublishOptions,
  PresenceClient,
  PresenceClientOptions,
  SchedulerLike,
} from "./internal/types";

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
  const statusMachine = createStatusMachine(state, publish);

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

  statusMachine.wireTransport();

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
      return statusMachine.subscribeStatus(listener);
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
      statusMachine.dispose();
      state.contextListeners.clear();
      for (const teardown of state.teardowns.splice(0)) {
        teardown();
      }
    },
  };
}

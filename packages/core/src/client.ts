import { jsonCodec } from "./codec.js";
import { defaultNow } from "./internal/clock.js";
import { createOversizedWarning, isDevMode, reportListenerError, warnOnce } from "./internal/dev-warnings.js";
import { defaultIdFactory } from "./internal/ids.js";
import { wireInbound } from "./internal/ingest.js";
import { startLiveness } from "./internal/liveness.js";
import { createPublishLoop } from "./internal/publish-loop.js";
import { createStatusMachine } from "./internal/reconnect.js";
import type {
  PresenceClient,
  PresenceClientOptions,
  PresenceClientState,
  SchedulerLike,
} from "./internal/types.js";
import {
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_SESSION_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_MESSAGE_BYTES,
  MAX_EVENT_TYPE_LENGTH,
} from "./protocol.js";
import {
  DEFAULT_IDLE_AFTER_MS,
  DEFAULT_MAX_REMOTE_CLIENTS,
  DEFAULT_STALE_TIMEOUT_MS,
  RemotePresenceStore,
} from "./store.js";

/** Default publish interval, in milliseconds. */
export const DEFAULT_PUBLISH_INTERVAL_MS = 50;

const MIN_SWEEP_INTERVAL_MS = 250;

/** Default heartbeat interval, in milliseconds. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

const MIN_TIMER_INTERVAL_MS = 1;
const MIN_STALE_TIMEOUT_MS = 1000;

export type {
  AdaptivePublishOptions,
  PresenceClient,
  PresenceClientOptions,
  SchedulerLike,
} from "./internal/types.js";

const defaultScheduler: SchedulerLike = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

function assertFiniteOptions(values: Record<string, number | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new TypeError(`createPresenceClient: ${name} must be a finite number, got ${String(value)}`);
    }
  }
}

/**
 * Creates one presence client.
 * The client sends and receives messages through the transport you give it.
 * The client calls `transport.connect()` itself unless you pass `autoConnect: false`.
 * @param options The client options. `transport` is required.
 * @returns The client.
 */
export function createPresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientOptions<TContext, TUser>,
): PresenceClient<TContext, TUser> {
  if (options?.transport === undefined || options.transport === null) {
    throw new TypeError("createPresenceClient: options.transport is required");
  }
  const {
    transport,
    codec = jsonCodec,
    maxRemoteClients,
    idFactory = defaultIdFactory,
    now = defaultNow,
    scheduler = defaultScheduler,
    validationLimits,
  } = options;

  assertFiniteOptions({
    publishIntervalMs: options.publishIntervalMs,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    staleTimeoutMs: options.staleTimeoutMs,
    idleAfterMs: options.idleAfterMs,
    maxRemoteClients,
    "adaptivePublish.highWatermarkBytes": options.adaptivePublish?.highWatermarkBytes,
    "adaptivePublish.lowWatermarkBytes": options.adaptivePublish?.lowWatermarkBytes,
    "adaptivePublish.slowPublishIntervalMs": options.adaptivePublish?.slowPublishIntervalMs,
  });

  const publishIntervalMs = Math.max(
    MIN_TIMER_INTERVAL_MS,
    options.publishIntervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS,
  );
  const adaptiveOptions = options.adaptivePublish;
  const highWatermarkBytes = Math.max(0, adaptiveOptions?.highWatermarkBytes ?? 64 * 1024);
  const lowWatermarkBytes = Math.max(
    0,
    Math.min(adaptiveOptions?.lowWatermarkBytes ?? highWatermarkBytes / 2, highWatermarkBytes),
  );
  const slowPublishIntervalMs = Math.max(
    MIN_TIMER_INTERVAL_MS,
    adaptiveOptions?.slowPublishIntervalMs ?? Math.max(publishIntervalMs * 4, 100),
  );
  const heartbeatIntervalMs = Math.max(
    MIN_TIMER_INTERVAL_MS,
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const staleTimeoutMs =
    options.staleTimeoutMs === undefined ? undefined : Math.max(MIN_STALE_TIMEOUT_MS, options.staleTimeoutMs);
  const idleAfterMs = options.idleAfterMs === undefined ? undefined : Math.max(0, options.idleAfterMs);

  if (isDevMode() && staleTimeoutMs !== undefined && staleTimeoutMs <= heartbeatIntervalMs * 2) {
    warnOnce(
      "stale-vs-heartbeat",
      `staleTimeoutMs (${options.staleTimeoutMs}) is at most twice heartbeatIntervalMs (${heartbeatIntervalMs}), so a quiet peer expires between heartbeats. Raise staleTimeoutMs or lower heartbeatIntervalMs.`,
    );
  }

  const clientId = options.clientId ?? idFactory();
  const maxClientIdLength = validationLimits?.maxClientIdLength ?? DEFAULT_MAX_CLIENT_ID_LENGTH;
  if (typeof clientId !== "string" || clientId.length < 1 || clientId.length > maxClientIdLength) {
    throw new TypeError(
      `createPresenceClient: clientId must be 1 to ${maxClientIdLength} characters, got ${typeof clientId === "string" ? clientId.length : typeof clientId}`,
    );
  }
  const maxSessionLength = validationLimits?.maxSessionLength ?? DEFAULT_MAX_SESSION_LENGTH;
  const session = idFactory();
  if (typeof session !== "string" || session.length < 1 || session.length > maxSessionLength) {
    throw new TypeError(
      `createPresenceClient: session must be 1 to ${maxSessionLength} characters, got ${typeof session === "string" ? session.length : typeof session}`,
    );
  }

  const status = transport.subscribeStatus ? (transport.getStatus?.() ?? "connecting") : "connected";

  const devMode = isDevMode();
  let warnedAboutRemoteCap = false;
  const store = new RemotePresenceStore<TContext, TUser>({
    ...(maxRemoteClients !== undefined ? { maxRemoteClients } : {}),
    ...(staleTimeoutMs !== undefined ? { staleTimeoutMs } : {}),
    ...(idleAfterMs !== undefined ? { idleAfterMs } : {}),
    now,
    onRemoteClientRejected: ({ clientId: droppedClientId }) => {
      if (devMode && !warnedAboutRemoteCap) {
        warnedAboutRemoteCap = true;
        console.warn(
          `[anchor-presence] remote presence store is full (maxRemoteClients=${maxRemoteClients ?? DEFAULT_MAX_REMOTE_CLIENTS}); new clientIds are dropped until an entry expires`,
        );
      }
      try {
        options.onRemoteClientRejected?.({ clientId: droppedClientId });
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
    heartbeatIntervalMs,
    // half the shorter of the two timeouts, so an idle or stale transition shows up within one sweep tick
    sweepIntervalMs: Math.max(
      MIN_SWEEP_INTERVAL_MS,
      Math.min(staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS, idleAfterMs ?? DEFAULT_IDLE_AFTER_MS) / 2,
    ),
    maxFieldBytes: validationLimits?.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES,
    maxMessageBytes: validationLimits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    validationLimits,
    devMode,
    store,
    context: options.context,
    user: options.user,
    onNewPeer: () => publish.requestFullPublish(),
    parseEvent: options.parseEvent,
    parseUser: options.parseUser,
    parseContext: options.parseContext,
    contextDirty: options.context !== undefined,
    userDirty: options.user !== undefined,
    sequence: 0,
    disposed: false,
    left: false,
    latestCursor: null,
    latestPointer: undefined,
    pendingPublish: false,
    pendingFullPublish: false,
    failedSendCount: 0,
    slowMode: false,
    publishTimer: null,
    heartbeatTimer: null,
    sweepTimer: null,
    newPeerTimer: null,
    status,
    contextListeners: new Set(),
    eventListeners: new Set(),
    userListeners: new Set(),
    eventRate: {
      burst: options.eventRateLimit?.burst ?? 20,
      perSecond: options.eventRateLimit?.perSecond ?? 10,
      totalPerSecond: options.eventRateLimit?.totalPerSecond ?? 100,
    },
    now,
    teardowns: [],
  };

  const warnIfOversized = createOversizedWarning(state);

  const publish = createPublishLoop(state);
  const statusMachine = createStatusMachine(state, publish);

  startLiveness(state, publish);

  wireInbound(state);

  statusMachine.wireTransport();

  if (state.status === "connected") publish.markReconnected();

  publish.wireVisibility();

  if (options.autoConnect !== false) {
    try {
      const result = transport.connect?.();
      if (result && typeof result.then === "function") {
        result.catch(() => {
          // a rejecting connect must not escape as an unhandled rejection; the transport reports failure via status
        });
      }
    } catch {
      // a throwing connect must not escape creation; the transport reports failure via status
    }
  }

  if (state.context !== undefined || state.user !== undefined) warnIfOversized();

  return {
    clientId,
    session,

    setLocalCursor(cursor, pointer) {
      if (state.disposed) return;
      state.latestCursor = cursor;
      if (pointer !== undefined) state.latestPointer = pointer;
      publish.markPending();
    },

    subscribeClose(listener) {
      return transport.subscribeClose?.(listener) ?? (() => {});
    },

    leave() {
      if (state.disposed || state.left) return;
      if (publish.send(null, false, true)) state.left = true;
    },

    sendEvent(type, data) {
      if (state.disposed || type.length < 1 || type.length > MAX_EVENT_TYPE_LENGTH) return false;
      return publish.sendEvent(type, data);
    },

    subscribeEvents(listener) {
      state.eventListeners.add(listener);
      return () => {
        state.eventListeners.delete(listener);
      };
    },

    subscribePeers(listener) {
      return state.store.subscribePeers(listener);
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
        } catch (error) {
          reportListenerError(error);
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
      for (const listener of state.userListeners) {
        try {
          listener();
        } catch (error) {
          reportListenerError(error);
        }
      }
    },

    subscribeUser(listener) {
      state.userListeners.add(listener);
      return () => {
        state.userListeners.delete(listener);
      };
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

    hasActiveCursors() {
      return state.store.hasActiveCursors();
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
      publish.send(null, false, true); // best-effort: receivers drop this client at once
      if (state.publishTimer !== null) scheduler.clearTimeout(state.publishTimer);
      if (state.heartbeatTimer !== null) scheduler.clearTimeout(state.heartbeatTimer);
      if (state.sweepTimer !== null) scheduler.clearTimeout(state.sweepTimer);
      if (state.newPeerTimer !== null) scheduler.clearTimeout(state.newPeerTimer);
      state.publishTimer = null;
      state.heartbeatTimer = null;
      state.sweepTimer = null;
      state.newPeerTimer = null;
      statusMachine.dispose();
      state.contextListeners.clear();
      state.eventListeners.clear();
      state.userListeners.clear();
      for (const teardown of state.teardowns.splice(0)) {
        try {
          teardown();
        } catch {
          // one throwing teardown must not skip the rest, or leave the transport connected
        }
      }
      try {
        void transport.disconnect?.();
      } catch {
        // a throwing disconnect must not break dispose
      }
    },
  };
}

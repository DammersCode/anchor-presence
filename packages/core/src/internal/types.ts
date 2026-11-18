import type { CursorCodec } from "../codec.js";
import type {
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  PeerChange,
  PointerInfo,
  RemoteEvent,
  RemotePresence,
} from "../protocol.js";
import type { RemotePresenceStore } from "../store.js";
import type { LiveCursorTransport, TransportClose } from "../transport.js";
import type { ValidationLimits } from "../validate.js";

/** Handle for one scheduled timer. */
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
  /** Time before a remote client counts as idle, in milliseconds. Default `DEFAULT_IDLE_AFTER_MS`, clamped below `staleTimeoutMs`. */
  idleAfterMs?: number;
  /** Heartbeat interval, in milliseconds. Default `DEFAULT_HEARTBEAT_INTERVAL_MS`. */
  heartbeatIntervalMs?: number;
  /** Maximum remote clients in the store. Default `DEFAULT_MAX_REMOTE_CLIENTS`. */
  maxRemoteClients?: number;
  /** Runs when the store drops a new `clientId` because the store is full. */
  onRemoteClientRejected?: (info: { clientId: string }) => void;
  /** The user value the client sends to remote peers. */
  user?: TUser;
  /** Checks the `user` of each remote message. Return `undefined` or throw to drop the field. Default: the value must have the shape of the local `user`. */
  parseUser?: (value: unknown) => TUser | undefined;
  /** Checks the `context` of each remote message. Return `undefined` or throw to drop the field. Default: the value must have the shape of the local `context`. */
  parseContext?: (value: unknown) => TContext | undefined;
  /** Checks each remote event. Return the event to deliver it, or `undefined` or throw to drop it. Default: deliver as is. */
  parseEvent?: (event: RemoteEvent) => RemoteEvent | undefined;
  /** The context value the client sends to remote peers. */
  context?: TContext;
  /** Returns a new random ID. The client uses it for `clientId` and `session`. */
  idFactory?: () => string;
  /** Returns the current time in milliseconds. Default `Date.now`. */
  now?: () => number;
  /**
   * Limits for inbound events. `burst` and `perSecond` apply to each sender, `totalPerSecond` to all senders together.
   * Defaults: burst 20, 10 per second per sender, 100 per second in total.
   */
  eventRateLimit?: { burst?: number; perSecond?: number; totalPerSecond?: number };
  /** The timer surface for the client schedules. Default: the global timers. */
  scheduler?: SchedulerLike;
  /** Limits for inbound messages. Default: the protocol defaults. */
  validationLimits?: ValidationLimits;
  /** Settings for the adaptive publish rate. Omit to keep the fixed rate. */
  adaptivePublish?: AdaptivePublishOptions;
  /**
   * When `false`, you call `transport.connect()` yourself, before or right after creating the
   * client. By default the client calls `transport.connect()` itself, once, during creation.
   * A transport with no `connect` method needs no call either way. `dispose()` always calls
   * `transport.disconnect()` when the transport provides one, regardless of this option.
   * @default true
   */
  autoConnect?: boolean;
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
  setLocalCursor(cursor: CursorPosition | null, pointer?: PointerInfo): void;
  /**
   * Adds a listener for connection closes, with the close code and reason.
   * A transport without `subscribeClose` never calls it.
   * @returns A function that removes the listener.
   */
  subscribeClose(listener: (close: TransportClose) => void): () => void;
  /**
   * Tells remote peers that this client left, so they remove it at once.
   * The next publish or heartbeat announces the client again.
   */
  leave(): void;
  /**
   * Sends a one-shot event to every remote peer, for example a reaction or a ping.
   * The client never stores the event, and never resends it.
   * @returns `false` when the client is not connected or the event is invalid.
   */
  sendEvent(type: string, data?: unknown): boolean;
  /**
   * Adds a listener for local user changes.
   * The client calls the listener on every `setUser` that changes the value.
   * @returns A function that removes the listener.
   */
  subscribeUser(listener: () => void): () => void;
  /**
   * Adds a listener for events from remote peers.
   * @returns A function that removes the listener.
   */
  subscribeEvents(listener: (event: RemoteEvent) => void): () => void;
  /**
   * Adds a listener for remote clients that join or leave, or change their `user` or `context`.
   * @returns A function that removes the listener.
   */
  subscribePeers(listener: (change: PeerChange<TContext, TUser>) => void): () => void;
  /**
   * Sets the context value the client sends to remote peers.
   * `undefined` clears the value.
   */
  setContext(context: TContext | undefined): void;
  /** Returns the local context value. */
  getContext(): TContext | undefined;
  /**
   * Adds a listener for local context changes.
   * The client calls the listener on every `setContext` that changes the value.
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
   * @remarks Returns a new array per accepted message; use getRemotePresence() for rendering.
   */
  getRemoteSnapshot(): CursorPresence<TContext, TUser>[];
  /**
   * Returns the stable remote snapshot, without `sequence`.
   * The client keeps the array identity while nothing observable changes.
   * Use this for rendering. Use `getRemoteSnapshot()` to watch `sequence`.
   */
  getRemotePresence(): RemotePresence<TContext, TUser>[];
  /**
   * Returns whether at least one remote client currently has a cursor position.
   * O(1) on the client returned by `createPresenceClient`; optional so custom clients may omit it.
   */
  hasActiveCursors?(): boolean;
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
   * Sends a leave message, stops timers, and calls `transport.disconnect()` when the transport has one.
   */
  dispose(): void;
}

/**
 * Shared state for one presence client.
 * The facade builds it; the internal modules read and update it.
 */
export type PresenceClientState<TContext, TUser> = {
  transport: LiveCursorTransport;
  codec: CursorCodec;
  scheduler: SchedulerLike;
  clientId: string;
  session: string;
  publishIntervalMs: number;
  slowPublishIntervalMs: number;
  highWatermarkBytes: number;
  lowWatermarkBytes: number;
  adaptivePublish: boolean;
  heartbeatIntervalMs: number;
  sweepIntervalMs: number;
  maxFieldBytes: number;
  maxMessageBytes: number;
  validationLimits: ValidationLimits | undefined;
  devMode: boolean;
  store: RemotePresenceStore<TContext, TUser>;
  context: TContext | undefined;
  user: TUser | undefined;
  onNewPeer: () => void;
  parseEvent: ((event: RemoteEvent) => RemoteEvent | undefined) | undefined;
  parseUser: ((value: unknown) => TUser | undefined) | undefined;
  parseContext: ((value: unknown) => TContext | undefined) | undefined;
  contextDirty: boolean;
  userDirty: boolean;
  sequence: number;
  disposed: boolean;
  left: boolean;
  latestCursor: CursorPosition | null;
  latestPointer: PointerInfo | undefined;
  pendingPublish: boolean;
  pendingFullPublish: boolean;
  failedSendCount: number;
  slowMode: boolean;
  publishTimer: TimerHandle | null;
  heartbeatTimer: TimerHandle | null;
  sweepTimer: TimerHandle | null;
  newPeerTimer: TimerHandle | null;
  status: ConnectionStatus;
  contextListeners: Set<() => void>;
  eventListeners: Set<(event: RemoteEvent) => void>;
  userListeners: Set<() => void>;
  eventRate: { burst: number; perSecond: number; totalPerSecond: number };
  now: () => number;
  teardowns: Array<() => void>;
};

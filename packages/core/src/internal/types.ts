import type { CursorCodec } from "../codec";
import type {
  ConnectionStatus,
  CursorPosition,
  PointerInfo,
} from "../protocol";
import type { RemotePresenceStore } from "../store";
import type { LiveCursorTransport } from "../transport";
import type { ValidationLimits } from "../validate";

/** Handle for one scheduled timer. */
export type TimerHandle = ReturnType<typeof setTimeout>;

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
  heartbeatMs: number;
  sweepIntervalMs: number;
  maxFieldBytes: number;
  maxMessageBytes: number;
  validationLimits: ValidationLimits | undefined;
  devMode: boolean;
  store: RemotePresenceStore<TContext, TUser>;
  context: TContext | undefined;
  user: TUser | undefined;
  contextDirty: boolean;
  userDirty: boolean;
  sequence: number;
  disposed: boolean;
  latestCursor: CursorPosition | null;
  latestPointer: PointerInfo | undefined;
  pendingPublish: boolean;
  pendingFullPublish: boolean;
  failedSendCount: number;
  slowMode: boolean;
  publishTimer: TimerHandle | null;
  heartbeatTimer: TimerHandle | null;
  sweepTimer: TimerHandle | null;
  status: ConnectionStatus;
  contextListeners: Set<() => void>;
  teardowns: Array<() => void>;
};

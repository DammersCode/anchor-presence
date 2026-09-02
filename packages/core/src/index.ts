export type {
  AnchorPoint,
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  PointerInfo,
  PointerType,
} from "./protocol";
export {
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_MESSAGE_BYTES,
  DEFAULT_MAX_SESSION_LENGTH,
} from "./protocol";

export { validatePresence } from "./validate";
export type { ValidationLimits } from "./validate";

export {
  DEFAULT_MAX_REMOTE_CLIENTS,
  DEFAULT_STALE_TIMEOUT_MS,
  RemotePresenceStore,
} from "./store";
export type { RemotePresenceStoreOptions } from "./store";

export { jsonCodec } from "./codec";
export type { CursorCodec } from "./codec";

export type { LiveCursorTransport } from "./transport";

export { createInMemoryPair } from "./inMemoryTransport";
export type { InMemoryPair, InMemoryPairOptions } from "./inMemoryTransport";

export {
  createPresenceClient,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_PUBLISH_INTERVAL_MS,
} from "./client";
export type {
  PresenceClient,
  PresenceClientOptions,
  SchedulerLike,
} from "./client";

export { linearInterpolator, noneInterpolator } from "./interpolate";
export type { Interpolator, InterpolatorFactory } from "./interpolate";

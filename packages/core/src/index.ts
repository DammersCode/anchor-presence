export type {
  AnchorPoint,
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  PointerInfo,
  PointerType,
  RemotePresence,
} from "./protocol.js";
export {
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_FIELD_DEPTH,
  DEFAULT_MAX_MESSAGE_BYTES,
  DEFAULT_MAX_SEQUENCE,
  DEFAULT_MAX_SESSION_LENGTH,
} from "./protocol.js";

export { validatePresence } from "./validate.js";
export type { ValidationLimits } from "./validate.js";

export {
  DEFAULT_IDLE_AFTER_MS,
  DEFAULT_MAX_REMOTE_CLIENTS,
  DEFAULT_STALE_TIMEOUT_MS,
  RemotePresenceStore,
} from "./store.js";
export type { RemotePresenceStoreOptions } from "./store.js";

export { jsonCodec } from "./codec.js";
export { binaryCodec } from "./binary-codec.js";
export type { CursorCodec } from "./codec.js";

export type { LiveCursorTransport } from "./transport.js";

export { createInMemoryPair } from "./in-memory-transport.js";
export type { InMemoryPair, InMemoryPairOptions, InMemoryTransport } from "./in-memory-transport.js";

export { createPresenceClient, DEFAULT_HEARTBEAT_MS, DEFAULT_PUBLISH_INTERVAL_MS } from "./client.js";
export type {
  AdaptivePublishOptions,
  PresenceClient,
  PresenceClientOptions,
  SchedulerLike,
} from "./client.js";

export { linearInterpolator, noneInterpolator } from "./interpolate.js";
export type { Interpolator, InterpolatorFactory } from "./interpolate.js";

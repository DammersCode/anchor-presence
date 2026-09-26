export { LiveCursorProvider } from "./provider.js";
export type { LiveCursorProviderProps } from "./provider.js";

export { LiveCursorContext } from "./context.js";
export type { LiveCursorContextValue } from "./context.js";

export { useCursorClient } from "./hooks/use-cursor-client.js";
export { useCursorContext } from "./hooks/use-cursor-context.js";
export { useCursorPresence } from "./hooks/use-cursor-presence.js";
export { useCursorStatus } from "./hooks/use-cursor-status.js";
export { usePresenceClient } from "./hooks/use-presence-client.js";
export { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/use-remote-cursors.js";
export { useRemoteUsers } from "./hooks/use-remote-users.js";

export type { PresenceClientFactoryOptions } from "./hooks/use-presence-client.js";
export type { RemoteUser } from "./hooks/use-remote-users.js";

export { CursorLayer, DefaultCursor } from "./cursor.js";
export type { CursorLayerProps, CursorRenderProps, DefaultCursorProps } from "./cursor.js";

// Foreign types used in this package's public signatures, re-exported for consumer convenience.
export type {
  AnchorPoint,
  ConnectionStatus,
  CursorPosition,
  CursorPresence,
  Interpolator,
  InterpolatorFactory,
  PresenceClient,
  RemotePresence,
} from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

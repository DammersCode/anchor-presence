export { LiveCursorProvider } from "./provider.js";
export type { LiveCursorProviderProps } from "./provider.js";

export { LiveCursorContext } from "./context.js";
export type { LiveCursorContextValue } from "./context.js";

export { useCursorBinding } from "./hooks/use-cursor-binding.js";
export { useCursorClient } from "./hooks/use-cursor-client.js";
export { useCursorContext } from "./hooks/use-cursor-context.js";
export { useCursorEvents } from "./hooks/use-cursor-events.js";
export { useLocalUser } from "./hooks/use-local-user.js";
export { usePeerChanges } from "./hooks/use-peer-changes.js";
export { useCursorPresence } from "./hooks/use-cursor-presence.js";
export { useCursorStatus } from "./hooks/use-cursor-status.js";
export { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/use-remote-cursors.js";
export { useRemoteUsers } from "./hooks/use-remote-users.js";
export { createPresenceHooks } from "./typed-hooks.js";

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
  EventChannel,
  EventMap,
  PeerChange,
  PresenceClient,
  PresenceEvent,
  RemoteEvent,
  RemotePresence,
  TypedRemoteEvent,
} from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

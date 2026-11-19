"use client";

export { PresenceProvider } from "./provider.js";
export type { PresenceProviderConfig, PresenceProviderProps } from "./provider.js";

export { PresenceProviderContext } from "./context.js";
export type { PresenceProviderValue } from "./context.js";

export { useDomBinding } from "./hooks/use-dom-binding.js";
export { usePresenceClient } from "./hooks/use-presence-client.js";
export { useLocalContext } from "./hooks/use-local-context.js";
export { useRemoteEvents } from "./hooks/use-remote-events.js";
export { useSendEvent } from "./hooks/use-send-event.js";
export { useLocalUser } from "./hooks/use-local-user.js";
export { usePeerChanges } from "./hooks/use-peer-changes.js";
export { useRemotePresence } from "./hooks/use-remote-presence.js";
export { usePresenceStatus } from "./hooks/use-presence-status.js";
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
  PresenceMessage,
  Interpolator,
  InterpolatorFactory,
  EventChannel,
  EventMap,
  PeerChange,
  PresenceClient,
  PresenceEvent,
  RemoteEvent,
  PointerType,
  RemotePresence,
  TypedRemoteEvent,
} from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

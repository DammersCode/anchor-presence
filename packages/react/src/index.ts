export { LiveCursorProvider } from "./provider";
export type { LiveCursorProviderProps } from "./provider";

export { LiveCursorContext } from "./context";
export type { LiveCursorContextValue } from "./context";

export { useCursorClient } from "./hooks/use-cursor-client";
export { useCursorContext } from "./hooks/use-cursor-context";
export { useCursorPresence } from "./hooks/use-cursor-presence";
export { useCursorStatus } from "./hooks/use-cursor-status";
export { usePresenceClient } from "./hooks/use-presence-client";
export { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/use-remote-cursors";
export { useRemoteUsers } from "./hooks/use-remote-users";

export type { PresenceClientFactoryOptions } from "./hooks/use-presence-client";
export type { RemoteUser } from "./hooks/use-remote-users";

export { CursorLayer, DefaultCursor } from "./cursor";
export type { CursorLayerProps, CursorRenderProps, DefaultCursorProps } from "./cursor";

// Foreign types used in this package's public signatures, re-exported for consumer convenience.
export type { ConnectionStatus, CursorPresence, PresenceClient } from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

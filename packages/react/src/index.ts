export { LiveCursorProvider } from "./provider";
export type { LiveCursorProviderProps } from "./provider";

export { LiveCursorContext } from "./context";
export type { LiveCursorContextValue } from "./context";

export { useCursorClient } from "./hooks/useCursorClient";
export { useCursorContext } from "./hooks/useCursorContext";
export { useCursorPresence } from "./hooks/useCursorPresence";
export { useCursorStatus } from "./hooks/useCursorStatus";
export { usePresenceClient } from "./hooks/usePresenceClient";
export { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/useRemoteCursors";
export { useRemoteUsers } from "./hooks/useRemoteUsers";

export type { PresenceClientFactoryOptions } from "./hooks/usePresenceClient";
export type { RemoteUser } from "./hooks/useRemoteUsers";

export { CursorLayer, DefaultCursor } from "./cursor";
export type { CursorLayerProps, CursorRenderProps, DefaultCursorProps } from "./cursor";

// Foreign types used in this package's public signatures, re-exported for consumer convenience.
export type { ConnectionStatus, CursorPresence, PresenceClient } from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

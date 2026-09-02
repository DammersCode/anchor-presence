export { LiveCursorProvider } from "./provider";
export type { LiveCursorProviderProps } from "./provider";

export { LiveCursorContext } from "./context";
export type { LiveCursorContextValue } from "./context";

export {
  useCursorClient,
  useCursorContext,
  useCursorPresence,
  useCursorStatus,
  usePresenceClient,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteUsers,
} from "./hooks";

export type { PresenceClientFactoryOptions, RemoteUser } from "./hooks";

export { CursorLayer, DefaultCursor } from "./cursor";
export type { CursorLayerProps, CursorRenderProps, DefaultCursorProps } from "./cursor";

// Foreign types used in this package's public signatures, re-exported for consumer convenience.
export type { ConnectionStatus, CursorPresence, PresenceClient } from "@anchor-presence/core";
export type { DomBinding, DomBindingOptions, ResolutionTier, ResolvedCursor } from "@anchor-presence/dom";

import { createPresenceHooks } from "@anchor-presence/react";
import type { TourContext, TourUser } from "./tour";

export const {
  CursorLayer,
  PresenceProvider,
  useDomBinding,
  useLocalContext,
  usePresenceClient,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteEvents,
  useRemoteUsers,
} = createPresenceHooks<TourContext, TourUser>();

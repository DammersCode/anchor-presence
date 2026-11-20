import { createPresenceHooks } from "@dammers/anchor-presence-react";
import type { DemoContext, DemoEvents, DemoUser } from "./setup";

/** One typed set of hooks for the whole demo: wrong user, context or event types do not compile. */
export const {
  CursorLayer,
  PresenceProvider,
  useDomBinding,
  useLocalContext,
  useRemoteEvents,
  useLocalUser,
  usePeerChanges,
  usePresenceStatus,
  useRemoteCursorsSelector,
  useRemotePresence,
  useRemoteUsers,
  useSendEvent,
} = createPresenceHooks<DemoContext, DemoUser, DemoEvents>();

import { createPresenceHooks } from "@anchor-presence/react";
import type { DemoContext, DemoEvents, DemoUser } from "./setup";

/** One typed set of hooks for the whole demo: wrong user, context or event types do not compile. */
export const {
  LiveCursorProvider,
  useCursorBinding,
  useCursorEvents,
  useLocalUser,
  usePeerChanges,
  useRemoteUsers,
  useSendEvent,
} = createPresenceHooks<DemoContext, DemoUser, DemoEvents>();

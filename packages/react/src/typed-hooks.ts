import type { ReactNode } from "react";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "./provider.js";
import type { LiveCursorProviderProps } from "./provider.js";
import { useCursorBinding } from "./hooks/use-cursor-binding.js";
import { useCursorClient } from "./hooks/use-cursor-client.js";
import { useCursorContext } from "./hooks/use-cursor-context.js";
import { useCursorEvents } from "./hooks/use-cursor-events.js";
import { useCursorPresence } from "./hooks/use-cursor-presence.js";
import { useCursorStatus } from "./hooks/use-cursor-status.js";
import { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/use-remote-cursors.js";
import { useRemoteUsers } from "./hooks/use-remote-users.js";

/**
 * Returns the provider and every hook with `TContext` and `TUser` fixed, so a wrong generic fails to compile.
 * Call it once at module level and export the result.
 */
export function createPresenceHooks<TContext = unknown, TUser = unknown>() {
  return {
    LiveCursorProvider: LiveCursorProvider as (props: LiveCursorProviderProps<TContext, TUser>) => ReactNode,
    useCursorBinding: () => useCursorBinding<TContext, TUser>(),
    useCursorClient: () => useCursorClient<TContext, TUser>(),
    useCursorContext: () => useCursorContext<TContext>(),
    useCursorEvents,
    useCursorPresence: () => useCursorPresence<TContext, TUser>(),
    useCursorStatus,
    useRemoteCursors: () => useRemoteCursors<TContext, TUser>(),
    useRemoteCursorsSelector: <TSelected>(
      select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
      isEqual?: (a: TSelected, b: TSelected) => boolean,
    ) => useRemoteCursorsSelector<TSelected, TContext, TUser>(select, isEqual),
    useRemoteUsers: () => useRemoteUsers<TUser>(),
  };
}

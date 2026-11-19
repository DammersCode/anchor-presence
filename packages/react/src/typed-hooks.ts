import type { ReactNode } from "react";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { PresenceProvider } from "./provider.js";
import type { PresenceProviderProps } from "./provider.js";
import { useDomBinding } from "./hooks/use-dom-binding.js";
import { usePresenceClient } from "./hooks/use-presence-client.js";
import { useLocalContext } from "./hooks/use-local-context.js";
import { createEventChannel } from "@anchor-presence/core";
import { useEffect, useRef } from "react";
import type { EventChannel, EventMap, PeerChange, TypedRemoteEvent } from "@anchor-presence/core";

import { usePresenceProviderContext } from "./hooks/use-presence-client.js";
import { useLocalUser } from "./hooks/use-local-user.js";
import { usePeerChanges } from "./hooks/use-peer-changes.js";
import { useSendEvent } from "./hooks/use-send-event.js";
import { useRemotePresence } from "./hooks/use-remote-presence.js";
import { usePresenceStatus } from "./hooks/use-presence-status.js";
import { useRemoteCursors, useRemoteCursorsSelector } from "./hooks/use-remote-cursors.js";
import { useRemoteUsers } from "./hooks/use-remote-users.js";

/**
 * Returns the provider and every hook with `TContext` and `TUser` fixed, so a wrong generic fails to compile.
 * Call it once at module level and export the result.
 */
export function createPresenceHooks<
  TContext = unknown,
  TUser = unknown,
  TEvents extends object = EventMap,
>() {
  return {
    PresenceProvider: PresenceProvider as (props: PresenceProviderProps<TContext, TUser>) => ReactNode,
    useDomBinding: () => useDomBinding<TContext, TUser>(),
    usePresenceClient: () => usePresenceClient<TContext, TUser>(),
    useLocalContext: () => useLocalContext<TContext>(),
    useRemoteEvents: (listener: (event: TypedRemoteEvent<TEvents>) => void): void => {
      const { client } = usePresenceProviderContext<TContext, TUser>();
      const listenerRef = useRef(listener);
      useEffect(() => {
        listenerRef.current = listener;
      });
      useEffect(
        () =>
          client === null
            ? undefined
            : createEventChannel<TEvents>(client).subscribe((event) => listenerRef.current(event)),
        [client],
      );
    },
    useSendEvent: (): EventChannel<TEvents>["send"] => useSendEvent<TEvents>(),
    useLocalUser: () => useLocalUser<TUser>(),
    usePeerChanges: (listener: (change: PeerChange<TContext, TUser>) => void) =>
      usePeerChanges<TContext, TUser>(listener),
    useRemotePresence: () => useRemotePresence<TContext, TUser>(),
    usePresenceStatus,
    useRemoteCursors: () => useRemoteCursors<TContext, TUser>(),
    useRemoteCursorsSelector: <TSelected>(
      select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
      isEqual?: (a: TSelected, b: TSelected) => boolean,
    ) => useRemoteCursorsSelector<TSelected, TContext, TUser>(select, isEqual),
    useRemoteUsers: () => useRemoteUsers<TUser>(),
  };
}

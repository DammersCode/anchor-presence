import { useCallback, useSyncExternalStore } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { EMPTY_PRESENCE, getServerPresence, usePresenceProviderContext } from "./use-presence-client.js";

export function useRemotePresenceIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): RemotePresence<TContext, TUser>[] {
  const { client } = usePresenceProviderContext(context);
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(
    () => (client !== null ? client.getRemotePresence() : EMPTY_PRESENCE),
    [client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerPresence);
}

/**
 * Returns the stable list of remote presences, without `sequence`.
 * The `user` and `context` of an entry have the type `unknown`. For typed values, use `useRemotePresence` from `createPresenceHooks`.
 * The hook rerenders only when an observable field changes.
 * Watch `sequence` with `client.getRemoteSnapshot()` and `client.subscribeRemote()`.
 */
export function useRemotePresence(): RemotePresence[] {
  return useRemotePresenceIn(PresenceProviderContext);
}

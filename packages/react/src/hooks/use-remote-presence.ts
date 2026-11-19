import { useCallback, useSyncExternalStore } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { EMPTY_PRESENCE, getServerPresence, usePresenceProviderContext } from "./use-presence-client.js";

/**
 * Returns the stable list of remote presences, without `sequence`.
 * The hook rerenders only when an observable field changes.
 * Watch `sequence` with `client.getRemoteSnapshot()` and `client.subscribeRemote()`.
 */
export function useRemotePresence<TContext = unknown, TUser = unknown>(): RemotePresence<TContext, TUser>[] {
  const { client } = usePresenceProviderContext<TContext, TUser>();
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

import { useCallback, useSyncExternalStore } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { EMPTY_PRESENCE, getServerPresence, usePresenceContext } from "./use-presence-client.js";

/**
 * Returns the stable list of remote presences, without `sequence`.
 * The hook rerenders only when an observable field changes.
 * Watch `sequence` with `client.getRemoteSnapshot()` and `client.subscribeRemote()`.
 */
export function useRemotePresence<TContext = unknown, TUser = unknown>(): RemotePresence<TContext, TUser>[] {
  const { client } = usePresenceContext<TContext, TUser>();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(
    () =>
      client !== null ? client.getRemotePresence() : (EMPTY_PRESENCE as RemotePresence<TContext, TUser>[]),
    [client],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerPresence as () => RemotePresence<TContext, TUser>[],
  );
}

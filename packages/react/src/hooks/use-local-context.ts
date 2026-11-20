import { useCallback, useMemo, useSyncExternalStore } from "react";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";
import { getContextStore } from "../context-store.js";
const getServerContext = (): undefined => {};

export function useLocalContextIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): [TContext | undefined, (next: TContext | undefined) => void] {
  const { client } = usePresenceProviderContext(context);
  const store = useMemo(() => (client !== null ? getContextStore(client) : null), [client]);

  const subscribe = useCallback(
    (listener: () => void) => (store !== null ? store.subscribe(listener) : () => {}),
    [store],
  );
  const getSnapshot = useCallback(() => (store !== null ? store.getSnapshot() : undefined), [store]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerContext);

  const setContext = useCallback(
    (next: TContext | undefined) => {
      store?.setContext(next);
    },
    [store],
  );

  return [value, setContext];
}

/**
 * Reads the local context value and gives a setter.
 * The value has the type `unknown`. For a typed value, use `useLocalContext` from `createPresenceHooks`.
 * The setter calls `client.setContext`, which sends the value to remote peers.
 * Returns `undefined` and a no-op setter on the server, and a no-op setter while no client exists.
 */
export function useLocalContext(): [unknown, (next: unknown) => void] {
  return useLocalContextIn(PresenceProviderContext);
}

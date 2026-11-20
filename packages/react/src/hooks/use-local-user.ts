import { useCallback, useSyncExternalStore } from "react";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";

export function useLocalUserIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): [TUser | undefined, (next: TUser | undefined) => void] {
  const { client } = usePresenceProviderContext(context);
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeUser(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(() => client?.getUser(), [client]);
  // oxlint-disable-next-line unicorn/no-useless-undefined -- the server snapshot function returns no user
  const user = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  const setUser = useCallback((next: TUser | undefined) => client?.setUser(next), [client]);
  return [user, setUser];
}

/**
 * Reads the local user value and gives a setter.
 * The value has the type `unknown`. For a typed value, use `useLocalUser` from `createPresenceHooks`.
 * The setter calls `client.setUser`, which sends the value to remote peers.
 * Returns `undefined` and a no-op setter without a client.
 */
export function useLocalUser(): [unknown, (next: unknown) => void] {
  return useLocalUserIn(PresenceProviderContext);
}

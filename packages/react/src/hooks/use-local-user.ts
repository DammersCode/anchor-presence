import { useCallback, useSyncExternalStore } from "react";
import { useLiveCursorContext } from "./use-cursor-client.js";

/**
 * Reads the local user value and gives a setter.
 * The setter calls `client.setUser`, which sends the value to remote peers.
 * Returns `undefined` and a no-op setter without a client.
 */
export function useLocalUser<TUser = unknown>(): [TUser | undefined, (next: TUser | undefined) => void] {
  const { client } = useLiveCursorContext<unknown, TUser>();
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

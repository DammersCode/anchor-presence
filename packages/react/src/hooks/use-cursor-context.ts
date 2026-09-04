import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLiveCursorContext } from "./use-cursor-client.js";
import { getContextStore } from "../context-store.js";

/**
 * Reads the local context value and gives a setter.
 * The setter calls `client.setContext`, which sends the value to remote peers.
 * Returns `undefined` and a no-op setter on the server.
 */
export function useCursorContext<TContext = unknown>(): [
  TContext | undefined,
  (next: TContext | undefined) => void,
] {
  const { client } = useLiveCursorContext<TContext, unknown>();
  const store = useMemo(() => (client !== null ? getContextStore(client) : null), [client]);

  const subscribe = useCallback(
    (listener: () => void) => (store !== null ? store.subscribe(listener) : () => {}),
    [store],
  );
  const getSnapshot = useCallback(() => (store !== null ? store.getSnapshot() : undefined), [store]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => undefined as TContext | undefined);

  const setContext = useCallback(
    (next: TContext | undefined) => {
      store?.setContext(next);
    },
    [store],
  );

  return [value, setContext];
}

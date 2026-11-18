import { useEffect, useRef } from "react";
import type { PeerChange } from "@anchor-presence/core";
import { useLiveCursorContext } from "./use-cursor-client.js";

/**
 * Calls `listener` when a remote client joins, leaves, or changes its `user` or `context`.
 * The hook keeps one subscription per client, so an inline `listener` does not resubscribe.
 */
export function usePeerChanges<TContext = unknown, TUser = unknown>(
  listener: (change: PeerChange<TContext, TUser>) => void,
): void {
  const { client } = useLiveCursorContext<TContext, TUser>();
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => client?.subscribePeers((change) => listenerRef.current(change)), [client]);
}

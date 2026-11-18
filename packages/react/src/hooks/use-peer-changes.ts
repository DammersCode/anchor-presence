import { useEffect, useRef } from "react";
import type { PeerChange } from "@anchor-presence/core";
import { useLiveCursorContext } from "./use-cursor-client.js";

/**
 * Calls `listener` when a remote client joins, leaves, or changes its `user` or `context`.
 * The hook keeps one subscription per client, so an inline `listener` does not resubscribe.
 */
export function usePeerChanges(listener: (change: PeerChange) => void): void {
  const { client } = useLiveCursorContext<unknown, unknown>();
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => client?.subscribePeers((change) => listenerRef.current(change)), [client]);
}

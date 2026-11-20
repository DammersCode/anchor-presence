import { useEffect, useRef } from "react";
import type { PeerChange } from "@anchor-presence/core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";

export function usePeerChangesIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
  listener: (change: PeerChange<TContext, TUser>) => void,
): void {
  const { client } = usePresenceProviderContext(context);
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => client?.subscribePeers((change) => listenerRef.current(change)), [client]);
}

/**
 * Calls `listener` when a remote client joins, leaves, or changes its `user` or `context`.
 * The `user` and `context` of a change have the type `unknown`. For typed values, use `usePeerChanges` from `createPresenceHooks`.
 * The hook keeps one subscription per client, so an inline `listener` does not resubscribe.
 */
export function usePeerChanges(listener: (change: PeerChange) => void): void {
  usePeerChangesIn(PresenceProviderContext, listener);
}

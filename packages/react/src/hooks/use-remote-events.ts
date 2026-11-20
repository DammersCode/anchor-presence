import { useEffect, useRef } from "react";
import type { EventMap, TypedRemoteEvent } from "@dammers/anchor-presence-core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";

export function useRemoteEventsIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
  listener: (event: TypedRemoteEvent<TEvents>) => void,
): void {
  const { client } = usePresenceProviderContext(context);
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => client?.subscribeEvents((event) => listenerRef.current(event)), [client]);
}

/**
 * Calls `listener` for every one-shot event a remote peer sends with `client.sendEvent`.
 * The `data` of an event has the type `unknown`. For typed events, use `useRemoteEvents` from `createPresenceHooks`.
 * The hook keeps one subscription per client, so an inline `listener` does not resubscribe.
 */
export function useRemoteEvents(listener: (event: TypedRemoteEvent<EventMap>) => void): void {
  useRemoteEventsIn(PresenceProviderContext, listener);
}

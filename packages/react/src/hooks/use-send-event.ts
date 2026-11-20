import { useMemo } from "react";
import { createEventChannel } from "@dammers/anchor-presence-core";
import type { EventChannel, EventMap } from "@dammers/anchor-presence-core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";

export function useSendEventIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): EventChannel<TEvents>["send"] {
  const { client } = usePresenceProviderContext(context);
  return useMemo(() => (client === null ? () => false : createEventChannel(client).send), [client]);
}

/**
 * Returns `send` for one-shot events. It returns `false` and sends nothing until the client exists.
 * Any event `type` is allowed. For a typed `send`, use `useSendEvent` from `createPresenceHooks`.
 */
export function useSendEvent(): EventChannel<EventMap>["send"] {
  return useSendEventIn(PresenceProviderContext);
}

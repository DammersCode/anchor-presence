import { useMemo } from "react";
import { createEventChannel } from "@anchor-presence/core";
import type { EventChannel, EventMap } from "@anchor-presence/core";
import { usePresenceProviderContext } from "./use-presence-client.js";

/** Returns `send` for one-shot events. It returns `false` and sends nothing until the client exists. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the type parameter types the returned `send`
export function useSendEvent<TEvents extends object = EventMap>(): EventChannel<TEvents>["send"] {
  const { client } = usePresenceProviderContext<unknown, unknown>();
  return useMemo(() => (client === null ? () => false : createEventChannel<TEvents>(client).send), [client]);
}

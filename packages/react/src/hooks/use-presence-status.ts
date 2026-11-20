import { useCallback, useSyncExternalStore } from "react";
import type { ConnectionStatus } from "@dammers/anchor-presence-core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { getServerStatus, usePresenceProviderContext } from "./use-presence-client.js";

export function usePresenceStatusIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): ConnectionStatus {
  const { client, clientPending } = usePresenceProviderContext(context);
  const noClientStatus = useCallback(
    (): ConnectionStatus => (clientPending === true ? "connecting" : getServerStatus()),
    [clientPending],
  );
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeStatus(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(
    () => (client !== null ? client.getStatus() : noClientStatus()),
    [client, noClientStatus],
  );
  return useSyncExternalStore(subscribe, getSnapshot, noClientStatus);
}

/**
 * Returns the connection status of the client from the nearest provider.
 * Returns `"connecting"` while a provider `factory` has not created its client, and `"disconnected"` without a client.
 */
export function usePresenceStatus(): ConnectionStatus {
  return usePresenceStatusIn(PresenceProviderContext);
}

import { useCallback, useSyncExternalStore } from "react";
import type { ConnectionStatus } from "@anchor-presence/core";
import { getServerStatus, usePresenceContext } from "./use-presence-client.js";

/**
 * Returns the connection status of the client from the nearest provider.
 * Returns `"connecting"` while a provider `factory` has not created its client, and `"disconnected"` without a client.
 */
export function usePresenceStatus(): ConnectionStatus {
  const { client, clientPending } = usePresenceContext();
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

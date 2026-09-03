import { useCallback, useSyncExternalStore } from "react";
import type { ConnectionStatus } from "@anchor-presence/core";
import { getServerStatus, useLiveCursorContext } from "./useCursorClient";

/**
 * Returns the connection status of the client from the nearest provider.
 * Returns `"disconnected"` on the server or without a provider.
 */
export function useCursorStatus(): ConnectionStatus {
  const { client } = useLiveCursorContext();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeStatus(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(() => (client !== null ? client.getStatus() : getServerStatus()), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerStatus);
}

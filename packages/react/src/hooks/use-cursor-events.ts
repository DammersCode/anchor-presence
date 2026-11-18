import { useEffect, useRef } from "react";
import type { RemoteEvent } from "@anchor-presence/core";
import { useLiveCursorContext } from "./use-cursor-client.js";

/**
 * Calls `listener` for every one-shot event a remote peer sends with `client.sendEvent`.
 * The hook keeps one subscription per client, so an inline `listener` does not resubscribe.
 */
export function useCursorEvents(listener: (event: RemoteEvent) => void): void {
  const { client } = useLiveCursorContext<unknown, unknown>();
  const listenerRef = useRef(listener);
  useEffect(() => {
    listenerRef.current = listener;
  });
  useEffect(() => client?.subscribeEvents((event) => listenerRef.current(event)), [client]);
}

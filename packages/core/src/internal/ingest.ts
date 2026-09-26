import { validatePresence } from "../validate.js";
import type { PresenceClientState } from "./types.js";

/**
 * Wires the transport inbound stream into the remote store.
 * Oversized, invalid, and self-echoed messages are dropped.
 */
export function wireInbound<TContext, TUser>(state: PresenceClientState<TContext, TUser>): void {
  const unsubscribeTransport = state.transport.subscribe((data) => {
    if (state.disposed) return;
    try {
      if (data.byteLength > state.maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
      const decoded = state.codec.decode(data);
      const presence = validatePresence<TContext, TUser>(decoded, state.validationLimits);
      if (presence === null) return;
      if (presence.clientId === state.clientId) return; // ignore echoes of our own messages
      state.store.ingest(presence);
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  state.teardowns.push(unsubscribeTransport);
}

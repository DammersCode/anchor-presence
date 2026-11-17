import { validatePresence } from "../validate.js";
import type { PresenceClientState } from "./types.js";

// A field the parser rejects is dropped, so the receiver keeps the previous value.
function parseField<T extends { user?: unknown; context?: unknown }>(
  presence: T,
  key: "user" | "context",
  parse: (value: unknown) => unknown,
): void {
  const value = presence[key];
  if (value === undefined || value === null) return;
  try {
    const parsed = parse(value);
    if (parsed === undefined) delete presence[key];
    else presence[key] = parsed as T[typeof key];
  } catch {
    delete presence[key];
  }
}

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
      if (state.parseUser !== undefined) parseField(presence, "user", state.parseUser);
      if (state.parseContext !== undefined) parseField(presence, "context", state.parseContext);
      state.store.ingest(presence);
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  state.teardowns.push(unsubscribeTransport);
}

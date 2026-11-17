import { validatePresence } from "../validate.js";
import type { PresenceClientState } from "./types.js";

function hasUnparsedField<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
  presence: { user?: unknown; context?: unknown },
): boolean {
  return (
    (state.parseUser === undefined && presence.user != null) ||
    (state.parseContext === undefined && presence.context != null)
  );
}

// A field the parser rejects is dropped, so the receiver keeps the previous value.
function parseField(
  presence: { user?: unknown; context?: unknown },
  key: "user" | "context",
  parse: (value: unknown) => unknown,
): void {
  const value = presence[key];
  if (value === undefined || value === null) return;
  try {
    const parsed = parse(value);
    if (parsed === undefined) delete presence[key];
    else presence[key] = parsed;
  } catch {
    delete presence[key];
  }
}

/**
 * Wires the transport inbound stream into the remote store.
 * Oversized, invalid, and self-echoed messages are dropped.
 */
export function wireInbound<TContext, TUser>(state: PresenceClientState<TContext, TUser>): void {
  let warnedUnparsed = false;
  const unsubscribeTransport = state.transport.subscribe((data) => {
    if (state.disposed) return;
    try {
      if (data.byteLength > state.maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
      const decoded = state.codec.decode(data);
      const presence = validatePresence<TContext, TUser>(decoded, state.validationLimits);
      if (presence === null) return;
      if (presence.clientId === state.clientId) return; // ignore echoes of our own messages
      if (state.devMode && !warnedUnparsed && hasUnparsedField(state, presence)) {
        warnedUnparsed = true;
        console.warn(
          "[anchor-presence] a remote user or context arrived without parseUser or parseContext; a malformed peer value reaches your render. See the security guide.",
        );
      }
      if (state.parseUser !== undefined) parseField(presence, "user", state.parseUser);
      if (state.parseContext !== undefined) parseField(presence, "context", state.parseContext);
      const known = state.store.has(presence.clientId, presence.session);
      if (state.store.ingest(presence) && !known && presence.leave !== true) state.onNewPeer();
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  state.teardowns.push(unsubscribeTransport);
}

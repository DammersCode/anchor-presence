import type { CursorPresence } from "../protocol.js";
import type { PresenceClientState } from "./types.js";

/** Returns `true` when `NODE_ENV` is not `production`. */
export function isDevMode(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env;
  return env?.NODE_ENV !== "production";
}

// Returns the JSON byte length of `value`, or `Number.POSITIVE_INFINITY` when it cannot serialize.
function jsonByteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : new TextEncoder().encode(json).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Returns a dev-mode warning for oversized outbound fields and messages.
 * Checked when context/user changes, not per message; receivers silently drop oversized fields.
 */
export function createOversizedWarning<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
): () => void {
  return () => {
    if (!state.devMode) return;
    try {
      if (state.context !== undefined && jsonByteLength(state.context) > state.maxFieldBytes) {
        console.warn(
          `[anchor-presence] outbound context exceeds maxFieldBytes (${state.maxFieldBytes}); receivers will drop the field`,
        );
      }
      if (state.user !== undefined && jsonByteLength(state.user) > state.maxFieldBytes) {
        console.warn(
          `[anchor-presence] outbound user exceeds maxFieldBytes (${state.maxFieldBytes}); receivers will drop the field`,
        );
      }
      const probe: CursorPresence<TContext, TUser> = {
        version: 1,
        clientId: state.clientId,
        session: state.session,
        sequence: state.sequence,
        cursor: state.latestCursor,
      };
      if (state.context !== undefined) probe.context = state.context;
      if (state.user !== undefined) probe.user = state.user;
      if (state.codec.encode(probe).byteLength > state.maxMessageBytes) {
        console.warn(
          `[anchor-presence] outbound message exceeds maxMessageBytes (${state.maxMessageBytes}); receivers will drop it`,
        );
      }
    } catch {
      // the sizing probe must never break the client
    }
  };
}

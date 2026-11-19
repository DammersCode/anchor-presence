import type { PresenceMessage } from "../protocol.js";
import type { PresenceClientState } from "./types.js";

/**
 * Returns `true` outside production builds.
 * Bundler-provided `import.meta.env` decides first; `NODE_ENV` is the fallback.
 */
export function isDevMode(): boolean {
  try {
    if (import.meta.env?.DEV === false) return false;
    // the literal `process.env.NODE_ENV` is what bundlers replace at build time
    // oxlint-disable-next-line typescript/prefer-optional-chain -- an optional chain hides the literal from bundler replacement
    return !(typeof process !== "undefined" && process.env.NODE_ENV === "production");
  } catch {
    return true;
  }
}

/** Prints an error that an app callback threw. The client keeps running; production builds stay silent. */
export function reportListenerError(error: unknown): void {
  if (isDevMode()) console.error("[anchor-presence] a listener threw; the client ignores the error", error);
}

const warnedKeys = new Set<string>();

/** Prints `message` once per `key` outside production builds. The sibling packages share it. */
export function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key) || !isDevMode()) return;
  warnedKeys.add(key);
  console.warn(`[anchor-presence] ${message}`);
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
export function createOversizedWarning<TContext, TUser, TEvents extends object>(
  state: PresenceClientState<TContext, TUser, TEvents>,
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
      const probe: PresenceMessage<TContext, TUser> = {
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

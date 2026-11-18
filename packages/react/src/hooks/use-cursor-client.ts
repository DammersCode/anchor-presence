import { useContext } from "react";
import type { ConnectionStatus, PresenceClient, RemotePresence } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { warnOnce } from "@anchor-presence/core";
import { LiveCursorContext, LiveCursorContextDefault } from "../context.js";
import type { LiveCursorContextValue } from "../context.js";

export const EMPTY_CURSORS: ResolvedCursor[] = [];
export const EMPTY_PRESENCE: RemotePresence[] = [];

export function getServerCursors(): ResolvedCursor[] {
  return EMPTY_CURSORS;
}

export function getServerPresence(): RemotePresence[] {
  return EMPTY_PRESENCE;
}

export function getServerStatus(): ConnectionStatus {
  return "disconnected";
}

export function useLiveCursorContext<TContext, TUser>(): LiveCursorContextValue<TContext, TUser> {
  const value = useContext(LiveCursorContext);
  if (value === LiveCursorContextDefault) {
    warnOnce(
      "no-provider",
      "a hook or CursorLayer runs outside LiveCursorProvider, so it returns empty data. Wrap the tree in LiveCursorProvider.",
    );
  }
  return value as LiveCursorContextValue<TContext, TUser>;
}

/**
 * Returns the presence client from the nearest provider.
 * Returns `null` when the hook runs without a provider.
 */
export function useCursorClient<TContext = unknown, TUser = unknown>(): PresenceClient<
  TContext,
  TUser
> | null {
  return useLiveCursorContext<TContext, TUser>().client;
}

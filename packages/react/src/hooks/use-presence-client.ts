import { useContext } from "react";
import type { ConnectionStatus, PresenceClient, RemotePresence } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { warnOnce } from "@anchor-presence/core";
import { PresenceContext, PresenceContextDefault } from "../context.js";
import type { PresenceContextValue } from "../context.js";

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

export function usePresenceContext<TContext, TUser>(): PresenceContextValue<TContext, TUser> {
  const value = useContext(PresenceContext);
  if (value === PresenceContextDefault) {
    warnOnce(
      "no-provider",
      "a hook or CursorLayer runs outside PresenceProvider, so it returns empty data. Wrap the tree in PresenceProvider.",
    );
  }
  return value as PresenceContextValue<TContext, TUser>;
}

/**
 * Returns the presence client from the nearest provider.
 * Returns `null` when the hook runs without a provider.
 */
export function usePresenceClient<TContext = unknown, TUser = unknown>(): PresenceClient<
  TContext,
  TUser
> | null {
  return usePresenceContext<TContext, TUser>().client;
}

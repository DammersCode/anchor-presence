import { useContext } from "react";
import type { ConnectionStatus, PresenceClient, RemotePresence } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { warnOnce } from "@anchor-presence/core";
import { PresenceProviderContext, PresenceProviderContextDefault } from "../context.js";
import type { PresenceProviderValue } from "../context.js";

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

export function usePresenceProviderContext<TContext, TUser>(): PresenceProviderValue<TContext, TUser> {
  const value = useContext(PresenceProviderContext);
  if (value === PresenceProviderContextDefault) {
    warnOnce(
      "no-provider",
      "a hook or CursorLayer runs outside PresenceProvider, so it returns empty data. Wrap the tree in PresenceProvider.",
    );
  }
  return value as PresenceProviderValue<TContext, TUser>;
}

/**
 * Returns the presence client from the nearest provider.
 * Returns `null` when the hook runs without a provider.
 */
export function usePresenceClient<TContext = unknown, TUser = unknown>(): PresenceClient<
  TContext,
  TUser
> | null {
  return usePresenceProviderContext<TContext, TUser>().client;
}

import { useContext } from "react";
import type { ConnectionStatus, PresenceClient } from "@anchor-presence/core";
import { warnOnce } from "@anchor-presence/core";
import { PresenceProviderContext, PresenceProviderContextDefault } from "../context.js";
import type { PresenceContext, PresenceProviderValue } from "../context.js";

export const EMPTY_CURSORS: never[] = [];
export const EMPTY_PRESENCE: never[] = [];

export function getServerCursors(): never[] {
  return EMPTY_CURSORS;
}

export function getServerPresence(): never[] {
  return EMPTY_PRESENCE;
}

export function getServerStatus(): ConnectionStatus {
  return "disconnected";
}

export function usePresenceProviderContext<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): PresenceProviderValue<TContext, TUser, TEvents> {
  const value = useContext(context);
  if (value === PresenceProviderContextDefault) {
    warnOnce(
      "no-provider",
      "a hook or CursorLayer runs outside PresenceProvider, so it returns empty data. Wrap the tree in PresenceProvider; hooks from createPresenceHooks need the provider of the same call.",
    );
  }
  return value;
}

export function usePresenceClientIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): PresenceClient<TContext, TUser, TEvents> | null {
  return usePresenceProviderContext(context).client;
}

/**
 * Returns the presence client from the nearest provider.
 * Returns `null` when the hook runs without a provider.
 */
export function usePresenceClient(): PresenceClient | null {
  return usePresenceClientIn(PresenceProviderContext);
}

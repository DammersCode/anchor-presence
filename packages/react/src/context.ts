import { createContext } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import type { DomBinding } from "@anchor-presence/dom";

/**
 * The value the context carries.
 */
export type LiveCursorContextValue<TContext = unknown, TUser = unknown> = {
  /** The presence client, or `null` when no provider is present. */
  client: PresenceClient<TContext, TUser> | null;
  /** The DOM binding, or `null` when none exists. */
  binding: DomBinding<TContext, TUser> | null;
};

const defaultValue: LiveCursorContextValue = { client: null, binding: null };

/**
 * The React context that carries the client and the binding.
 */
export const LiveCursorContext = createContext<LiveCursorContextValue>(defaultValue);

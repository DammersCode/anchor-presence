import { createContext } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import type { DomBinding } from "@anchor-presence/dom";

/**
 * The value the context carries.
 */
export type LiveCursorContextValue<TContext = unknown, TUser = unknown> = {
  /** The presence client, or `null` when no provider is present or the client does not exist yet. */
  client: PresenceClient<TContext, TUser> | null;
  /** The DOM binding, or `null` when none exists. */
  binding: DomBinding<TContext, TUser> | null;
  /** `true` while a provider `factory` has not created its client yet. */
  clientPending?: boolean;
};

/** The context value without a provider. Compare against it to detect a missing provider. */
export const LiveCursorContextDefault: LiveCursorContextValue = { client: null, binding: null };

/**
 * The React context that carries the client and the binding.
 */
export const LiveCursorContext = createContext<LiveCursorContextValue>(LiveCursorContextDefault);

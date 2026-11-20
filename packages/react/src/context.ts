import { createContext } from "react";
import type { Context } from "react";
import type { EventMap, PresenceClient } from "@dammers/anchor-presence-core";
import type { DomBinding } from "@dammers/anchor-presence-dom";

/**
 * The value the context carries.
 */
export type PresenceProviderValue<TContext = unknown, TUser = unknown, TEvents extends object = EventMap> = {
  /** The presence client, or `null` when no provider is present or the client does not exist yet. */
  client: PresenceClient<TContext, TUser, TEvents> | null;
  /** The DOM binding, or `null` when none exists. */
  binding: DomBinding<TContext, TUser> | null;
  /** `true` while a provider `factory` has not created its client yet. */
  clientPending?: boolean;
};

export type PresenceContext<TContext, TUser, TEvents extends object> = Context<
  PresenceProviderValue<TContext, TUser, TEvents>
>;

/** The context value without a provider. Compare against it to detect a missing provider. */
export const PresenceProviderContextDefault = { client: null, binding: null } as const;

export function createPresenceContext<TContext, TUser, TEvents extends object>(): PresenceContext<
  TContext,
  TUser,
  TEvents
> {
  return createContext<PresenceProviderValue<TContext, TUser, TEvents>>(PresenceProviderContextDefault);
}

/**
 * The React context that carries the client and the binding.
 */
export const PresenceProviderContext = createPresenceContext<unknown, unknown, EventMap>();

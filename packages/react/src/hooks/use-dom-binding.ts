import type { DomBinding } from "@anchor-presence/dom";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { usePresenceProviderContext } from "./use-presence-client.js";

export function useDomBindingIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): DomBinding<TContext, TUser> | null {
  return usePresenceProviderContext(context).binding;
}

/**
 * Returns the DOM binding from the nearest provider.
 * Returns `null` before the provider creates the binding, and without a provider.
 * Call `binding.invalidate()` when state that a `visibilityPolicy` reads changes.
 */
export function useDomBinding(): DomBinding | null {
  return useDomBindingIn(PresenceProviderContext);
}

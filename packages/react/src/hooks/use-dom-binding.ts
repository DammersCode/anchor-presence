import type { DomBinding } from "@anchor-presence/dom";
import { usePresenceProviderContext } from "./use-presence-client.js";

/**
 * Returns the DOM binding from the nearest provider.
 * Returns `null` before the provider creates the binding, and without a provider.
 * Call `binding.invalidate()` when state that a `visibilityPolicy` reads changes.
 */
export function useDomBinding<TContext = unknown, TUser = unknown>(): DomBinding<TContext, TUser> | null {
  return usePresenceProviderContext<TContext, TUser>().binding;
}

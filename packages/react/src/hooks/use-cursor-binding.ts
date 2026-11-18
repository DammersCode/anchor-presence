import type { DomBinding } from "@anchor-presence/dom";
import { useLiveCursorContext } from "./use-cursor-client.js";

/**
 * Returns the DOM binding from the nearest provider.
 * Returns `null` before the provider creates the binding, and without a provider.
 * Call `binding.invalidate()` when state that a `visibilityPolicy` reads changes.
 */
export function useCursorBinding<TContext = unknown, TUser = unknown>(): DomBinding<TContext, TUser> | null {
  return useLiveCursorContext<TContext, TUser>().binding;
}

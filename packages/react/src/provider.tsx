import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding, DomBindingOptions } from "@anchor-presence/dom";
import { LiveCursorContext } from "./context";
import type { LiveCursorContextValue } from "./context";

/**
 * Props for `LiveCursorProvider`.
 */
export type LiveCursorProviderProps<TContext = unknown, TUser = unknown> = {
  /** The client to provide. `null` provides no client. */
  client: PresenceClient<TContext, TUser> | null;
  /** A binding you created. Omit to let the provider create one. */
  binding?: DomBinding<TContext, TUser>;
  /** Options for the binding the provider creates. */
  bindingOptions?: DomBindingOptions<TContext, TUser>;
  /** The tree below the provider. */
  children?: ReactNode;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Provides the presence client and the binding to the tree below.
 * The provider creates a DOM binding when you do not pass one.
 * The provider reads `bindingOptions` once, when it creates the binding.
 */
export function LiveCursorProvider<TContext = unknown, TUser = unknown>(
  props: LiveCursorProviderProps<TContext, TUser>,
): ReactNode {
  const { client, binding: providedBinding, bindingOptions, children } = props;

  const [ownBinding, setOwnBinding] = useState<DomBinding<TContext, TUser> | null>(null);
  // bindingOptions changes are ignored after the binding is created. The binding is created once per client.
  const bindingOptionsRef = useRef(bindingOptions);
  useEffect(() => {
    bindingOptionsRef.current = bindingOptions;
  });

  useEffect(() => {
    if (providedBinding !== undefined) return;
    if (client === null) return;
    if (!isBrowser()) return;

    const created = createDomBinding(client, bindingOptionsRef.current);
    setOwnBinding(created);
    return () => {
      created.dispose();
      setOwnBinding(null);
    };
  }, [client, providedBinding]);

  const activeBinding = providedBinding ?? ownBinding;

  const value = useMemo<LiveCursorContextValue<TContext, TUser>>(
    () => ({ client, binding: activeBinding }),
    [client, activeBinding],
  );

  return (
    <LiveCursorContext.Provider value={value}>
      {children}
    </LiveCursorContext.Provider>
  );
}

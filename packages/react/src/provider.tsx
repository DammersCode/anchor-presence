import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding, DomBindingOptions } from "@anchor-presence/dom";
import { LiveCursorContext } from "./context";
import type { LiveCursorContextValue } from "./context";

export type LiveCursorProviderProps<TContext = unknown, TUser = unknown> = {
  client: PresenceClient<TContext, TUser> | null;
  binding?: DomBinding<TContext, TUser>;
  bindingOptions?: DomBindingOptions<TContext, TUser>;
  children?: ReactNode;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function LiveCursorProvider<TContext = unknown, TUser = unknown>(
  props: LiveCursorProviderProps<TContext, TUser>,
): ReactNode {
  const { client, binding: providedBinding, bindingOptions, children } = props;

  const [ownBinding, setOwnBinding] = useState<DomBinding<TContext, TUser> | null>(null);
  // bindingOptions changes are intentionally ignored after the binding is created — the binding is created once per client.
  const bindingOptionsRef = useRef(bindingOptions);
  bindingOptionsRef.current = bindingOptions;

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
    <LiveCursorContext.Provider value={value as LiveCursorContextValue}>
      {children}
    </LiveCursorContext.Provider>
  );
}

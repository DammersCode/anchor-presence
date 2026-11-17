import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding, DomBindingOptions } from "@anchor-presence/dom";
import { LiveCursorContext } from "./context.js";
import type { LiveCursorContextValue } from "./context.js";

/**
 * Props for `LiveCursorProvider`.
 */
export type LiveCursorProviderProps<TContext = unknown, TUser = unknown> = {
  /**
   * Creates the client the provider owns.
   * The provider runs it once per mount, in an effect, and disposes the client on unmount.
   * Omit it when you pass `client`.
   */
  factory?: () => PresenceClient<TContext, TUser>;
  /**
   * A client you own; the provider never disposes it.
   * `null` provides no client. Wins over `factory` when both are set.
   */
  client?: PresenceClient<TContext, TUser> | null;
  /** A binding you created. Omit to let the provider create one. */
  binding?: DomBinding<TContext, TUser>;
  /** Options for the binding the provider creates. */
  bindingOptions?: DomBindingOptions<TContext, TUser>;
  /** Change this value to dispose the client `factory` made and create a new one, for example to join another room. */
  clientKey?: unknown;
  /** Change this value to rebuild the binding with the current `bindingOptions`. The client stays connected. */
  bindingKey?: unknown;
  /** The tree below the provider. */
  children?: ReactNode;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Provides the presence client and the binding to the tree below.
 * The provider creates and disposes the client from `factory`; a `client` prop stays yours to dispose.
 * The provider creates a DOM binding when you do not pass one.
 * The provider reads `bindingOptions` when it creates the binding. Change `bindingKey` to create a new binding with the latest options, without touching the client.
 */
export function LiveCursorProvider<TContext = unknown, TUser = unknown>(
  props: LiveCursorProviderProps<TContext, TUser>,
): ReactNode {
  const {
    factory,
    client: providedClient,
    binding: providedBinding,
    bindingOptions,
    bindingKey,
    clientKey,
    children,
  } = props;

  const [ownClient, setOwnClient] = useState<PresenceClient<TContext, TUser> | null>(null);
  // The factory runs once per mount and once more each time clientKey changes. Other factory and client changes are ignored.
  const factoryRef = useRef(factory);
  const providedClientRef = useRef(providedClient);
  useEffect(() => {
    factoryRef.current = factory;
    providedClientRef.current = providedClient;
  });

  useEffect(() => {
    // oxlint-disable-next-line react/refs -- one-shot creation: skip when the mount render had a client prop
    if (providedClientRef.current !== undefined) return;
    // oxlint-disable-next-line react/refs -- one-shot creation path
    const create = factoryRef.current;
    if (create === undefined) return;
    if (!isBrowser()) return;

    const created = create();
    setOwnClient(created);
    return () => {
      created.dispose();
      setOwnClient(null);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- clientKey is the deliberate re-create trigger
  }, [clientKey]);

  const client = providedClient ?? ownClient;

  // set on unmount only, so a bindingKey rebuild keeps the local cursor and an unmount clears it
  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  const [ownBinding, setOwnBinding] = useState<DomBinding<TContext, TUser> | null>(null);
  // bindingOptions changes are ignored until bindingKey changes. The binding is created once per client and key.
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
      // oxlint-disable-next-line react/refs -- read at cleanup time on purpose
      created.dispose({ keepLocalCursor: !unmountingRef.current });
      setOwnBinding(null);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- bindingKey is the deliberate rebuild trigger
  }, [client, providedBinding, bindingKey]);

  const activeBinding = providedBinding ?? ownBinding;

  const value = useMemo<LiveCursorContextValue<TContext, TUser>>(
    () => ({ client, binding: activeBinding }),
    [client, activeBinding],
  );

  return <LiveCursorContext.Provider value={value}>{children}</LiveCursorContext.Provider>;
}

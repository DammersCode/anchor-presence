import { useEffect, useReducer, useRef } from "react";
import type { PresenceClient } from "@anchor-presence/core";

const DEFAULT_CLIENT_KEY = "__default__";

const clientRegistry = new Map<string, PresenceClient>();

function wrapClient<TContext, TUser>(
  client: PresenceClient<TContext, TUser>,
  key: string,
): PresenceClient<TContext, TUser> {
  return {
    ...client,
    dispose: () => {
      clientRegistry.delete(key);
      client.dispose();
    },
  };
}

/**
 * Options for `usePresenceClient`.
 */
export type PresenceClientFactoryOptions<TContext = unknown, TUser = unknown> = {
  /**
   * Creates the client. The hook runs it once per `key`, on first mount, in an effect.
   * Server renders never run the factory. The factory owns the transport: call `transport.connect()` inside it.
   */
  factory: (opts: { key?: string }) => PresenceClient<TContext, TUser>;
  /**
   * Identity for multi-client setups.
   * The same `key` resolves to the same client across renders and StrictMode remounts.
   * The hook uses a default key when you omit it.
   */
  key?: string;
};

/**
 * Returns the presence client for `key`, or `null` until the client exists.
 * The hook runs the factory once per `key`, on first mount, in an effect.
 * Server renders return `null` and never run the factory.
 * The same `key` resolves to the same client across renders, remounts, and StrictMode.
 * The hook never disposes on unmount. Call `client.dispose()` to end the client.
 * After `dispose()`, the next render creates a new client.
 * The hook does not connect the transport. The factory owns the transport.
 */
export function usePresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientFactoryOptions<TContext, TUser>,
): PresenceClient<TContext, TUser> | null {
  const { factory, key = DEFAULT_CLIENT_KEY } = options;
  const factoryRef = useRef(factory);
  // oxlint-disable-next-line react/refs -- latest-ref pattern: the creation effect reads the latest factory
  factoryRef.current = factory;
  const [, force] = useReducer((tick: number) => tick + 1, 0);
  const registryHas = clientRegistry.has(key);
  const client = (clientRegistry.get(key) as PresenceClient<TContext, TUser> | undefined) ?? null;

  useEffect(() => {
    if (!clientRegistry.has(key)) {
      // oxlint-disable-next-line react/refs -- one-shot creation path
      clientRegistry.set(key, wrapClient<TContext, TUser>(factoryRef.current({ key }), key));
      force();
      return;
    }
    if (!registryHas) force();
  }, [key, registryHas]);

  return client;
}

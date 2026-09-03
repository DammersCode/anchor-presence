import { useRef } from "react";
import type { PresenceClient } from "@anchor-presence/core";

const DEFAULT_CLIENT_KEY = "__default__";

const clientRegistry = new Map<string, PresenceClient>();

function wrapClient<TContext, TUser>(client: PresenceClient<TContext, TUser>, key: string): PresenceClient<TContext, TUser> {
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
   * Creates the client. The hook runs it once per `key`, on first use.
   * The factory owns the transport: call `transport.connect()` inside it.
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
 * Returns one presence client per `key`.
 * The hook runs the factory once, on first use, and keeps the client for the page lifetime.
 * The hook never disposes on unmount. Call `client.dispose()` to end the client.
 * After `dispose()`, the next render creates a new client.
 * The hook does not connect the transport. The factory owns the transport.
 */
export function usePresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientFactoryOptions<TContext, TUser>,
): PresenceClient<TContext, TUser> {
  const { factory, key = DEFAULT_CLIENT_KEY } = options;
  const factoryRef = useRef(factory);
  // oxlint-disable-next-line react/refs -- latest-ref pattern: creation uses the first render's factory
  factoryRef.current = factory;

  let client = clientRegistry.get(key);
  if (client === undefined) {
    // oxlint-disable-next-line react/refs -- reads the latest-ref set above on the one-shot creation path
    client = wrapClient<TContext, TUser>(factoryRef.current({ key }), key);
    clientRegistry.set(key, client);
  }
  return client as PresenceClient<TContext, TUser>;
}

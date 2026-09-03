import { useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ConnectionStatus, PresenceClient, RemotePresence } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorContext } from "./context";
import type { LiveCursorContextValue } from "./context";
import { getContextStore } from "./contextStore";

const EMPTY_CURSORS: ResolvedCursor[] = [];
const EMPTY_PRESENCE: RemotePresence[] = [];

function getServerCursors(): ResolvedCursor[] {
  return EMPTY_CURSORS;
}

function getServerPresence(): RemotePresence[] {
  return EMPTY_PRESENCE;
}

function getServerStatus(): ConnectionStatus {
  return "disconnected";
}

function useLiveCursorContext<TContext, TUser>(): LiveCursorContextValue<TContext, TUser> {
  return useContext(LiveCursorContext) as LiveCursorContextValue<TContext, TUser>;
}

/**
 * Returns the presence client from the nearest provider.
 * Returns `null` when the hook runs without a provider.
 */
export function useCursorClient<TContext = unknown, TUser = unknown>(): PresenceClient<TContext, TUser> | null {
  return useLiveCursorContext<TContext, TUser>().client;
}

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

/**
 * Returns the resolved remote cursors.
 * The hook rerenders on every new cursor snapshot.
 * Returns an empty list on the server or without a binding.
 */
export function useRemoteCursors<TContext = unknown, TUser = unknown>(): ResolvedCursor<TContext, TUser>[] {
  const { binding } = useLiveCursorContext<TContext, TUser>();
  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );
  const getSnapshot = useCallback(
    () => (binding !== null ? binding.getSnapshot() : (EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[])),
    [binding],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerCursors as () => ResolvedCursor<TContext, TUser>[]);
}

/**
 * Subscribes to the resolved-cursor snapshot through a selector, and rerenders only when the
 * selected value changes under `isEqual`. Keep `select` and `isEqual` stable across renders.
 */
export function useRemoteCursorsSelector<TSelected, TContext = unknown, TUser = unknown>(
  select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const { binding } = useLiveCursorContext<TContext, TUser>();
  const selectedRef = useRef<{ value: TSelected } | null>(null);

  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );

  const getSnapshot = useCallback(() => {
    const cursors = binding !== null ? binding.getSnapshot() : (EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[]);
    const next = select(cursors);
    const previous = selectedRef.current;
    // useSyncExternalStore compares by identity, so an equal selection must return the previous reference
    if (previous !== null && isEqual(previous.value, next)) return previous.value;
    selectedRef.current = { value: next };
    return next;
  }, [binding, select, isEqual]);

  // computed once: React may call the server snapshot repeatedly, and it compares by identity
  const [serverValue] = useState(() => select(EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[]));
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns the stable list of remote presences, without `sequence`.
 * The hook rerenders only when an observable field changes.
 * Watch `sequence` with `client.getRemoteSnapshot()` and `client.subscribeRemote()`.
 */
export function useCursorPresence<TContext = unknown, TUser = unknown>(): RemotePresence<TContext, TUser>[] {
  const { client } = useLiveCursorContext<TContext, TUser>();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(
    () => (client !== null ? client.getRemotePresence() : (EMPTY_PRESENCE as RemotePresence<TContext, TUser>[])),
    [client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerPresence as () => RemotePresence<TContext, TUser>[]);
}

/**
 * One remote user, keyed by client.
 */
export type RemoteUser<TUser = unknown> = {
  /** The client that sent the user value. */
  clientId: string;
  /** The user value, or `undefined` when the sender sent none. */
  user: TUser | undefined;
  /** The session ID of the client. */
  session: string;
};

function projectRemoteUsers<TUser>(snapshot: RemotePresence<unknown, TUser>[]): RemoteUser<TUser>[] {
  return snapshot.map((p) => ({ clientId: p.clientId, user: p.user === null ? undefined : p.user, session: p.session }));
}

/**
 * Returns the remote user values, one entry per client.
 * The list follows the stable presence snapshot.
 */
// TContext keeps the generic arity aligned with the other hooks. The list mirrors the remote snapshot of the client.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TUser>[] {
  const presence = useCursorPresence<TContext, TUser>();
  return useMemo(() => projectRemoteUsers(presence), [presence]);
}

/**
 * Returns the connection status of the client from the nearest provider.
 * Returns `"disconnected"` on the server or without a provider.
 */
export function useCursorStatus(): ConnectionStatus {
  const { client } = useLiveCursorContext();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeStatus(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(() => (client !== null ? client.getStatus() : getServerStatus()), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerStatus);
}

/**
 * Reads the local context value and gives a setter.
 * The setter calls `client.setContext`, which sends the value to remote peers.
 * Returns `undefined` and a no-op setter on the server.
 */
// TUser keeps the generic arity aligned with the other hooks. Removing it breaks existing call sites.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function useCursorContext<TContext = unknown, TUser = unknown>(): [
  TContext | undefined,
  (next: TContext | undefined) => void,
] {
  const { client } = useLiveCursorContext<TContext, TUser>();
  const store = useMemo(() => (client !== null ? getContextStore(client) : null), [client]);

  const subscribe = useCallback(
    (listener: () => void) => (store !== null ? store.subscribe(listener) : () => {}),
    [store],
  );
  const getSnapshot = useCallback(() => (store !== null ? store.getSnapshot() : undefined), [store]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => undefined as TContext | undefined);

  const setContext = useCallback(
    (next: TContext | undefined) => {
      store?.setContext(next);
    },
    [store],
  );

  return [value, setContext];
}

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

export type PresenceClientFactoryOptions<TContext = unknown, TUser = unknown> = {
  /**
   * Creates the client. It runs exactly once per `key` per page; the hook memoizes the
   * result for the page lifetime and uses the first render's closure. Own the transport
   * here: call `transport.connect()` inside the factory or before render.
   */
  factory: (opts: { key?: string }) => PresenceClient<TContext, TUser>;
  /**
   * Identity for multi-client setups. The same `key` resolves to the same client across
   * renders and StrictMode remounts. Omit it for the single-client case.
   */
  key?: string;
};

/**
 * Stable PresenceClient per `key`, memoized for the page lifetime (module-scoped registry).
 *
 * The hook never disposes on unmount: PresenceClient is a one-way latch, and remounts
 * (StrictMode, route changes) must keep working. Call `dispose()` explicitly. It clears
 * the `key` entry, so a later render re-creates the client through the factory.
 * The hook does not call `transport.connect()`: the factory owns the transport lifecycle.
 *
 * ```ts
 * const client = usePresenceClient({
 *   factory: () => createPresenceClient({ transport }), // connect the transport inside the factory
 * });
 * ```
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
 * Render-stable remote presence list. Rerenders only when an observable field
 * (cursor, context, user, pointer, session, or membership) changes. `sequence` is not
 * included; watch sequences with `client.getRemoteSnapshot()` + `client.subscribeRemote()`.
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

export type RemoteUser<TUser = unknown> = {
  clientId: string;
  user: TUser | undefined;
  session: string;
};

function projectRemoteUsers<TUser>(snapshot: RemotePresence<unknown, TUser>[]): RemoteUser<TUser>[] {
  return snapshot.map((p) => ({ clientId: p.clientId, user: p.user === null ? undefined : p.user, session: p.session }));
}

// TContext keeps the generic arity aligned with the other hooks; the list mirrors the client's remote snapshot
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TUser>[] {
  const presence = useCursorPresence<TContext, TUser>();
  return useMemo(() => projectRemoteUsers(presence), [presence]);
}

export function useCursorStatus(): ConnectionStatus {
  const { client } = useLiveCursorContext();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeStatus(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(() => (client !== null ? client.getStatus() : getServerStatus()), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerStatus);
}

// TUser keeps the generic arity aligned with the other hooks; removing it would break existing call sites
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

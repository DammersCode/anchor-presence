import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ConnectionStatus, CursorPresence, PresenceClient } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorContext } from "./context";
import type { LiveCursorContextValue } from "./context";
import { getContextStore } from "./contextStore";

const EMPTY_CURSORS: ResolvedCursor[] = [];
const EMPTY_PRESENCE: CursorPresence[] = [];

function getServerCursors(): ResolvedCursor[] {
  return EMPTY_CURSORS;
}

function getServerPresence(): CursorPresence[] {
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

export function useCursorAnchor(id: string): (element: Element | null) => void {
  const { binding } = useLiveCursorContext();
  const idRef = useRef(id);
  const elementRef = useRef<Element | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  idRef.current = id;

  const register = useCallback(
    (element: Element | null) => {
      if (unregisterRef.current !== null) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
      elementRef.current = element;
      if (element !== null && binding !== null) {
        unregisterRef.current = binding.registry.register(idRef.current, element);
      }
    },
    [binding],
  );

  const idChangedRef = useRef(id);
  useEffect(() => {
    if (idChangedRef.current === id) return;
    idChangedRef.current = id;
    register(elementRef.current);
  }, [id, register]);

  return register;
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

export function useCursorPresence<TContext = unknown, TUser = unknown>(): CursorPresence<TContext, TUser>[] {
  const { client } = useLiveCursorContext<TContext, TUser>();
  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );
  const getSnapshot = useCallback(
    () => (client !== null ? client.getRemoteSnapshot() : (EMPTY_PRESENCE as CursorPresence<TContext, TUser>[])),
    [client],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerPresence as () => CursorPresence<TContext, TUser>[]);
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

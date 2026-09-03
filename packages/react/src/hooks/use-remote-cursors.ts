import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { EMPTY_CURSORS, getServerCursors, useLiveCursorContext } from "./use-cursor-client";

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

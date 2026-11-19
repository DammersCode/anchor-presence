import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { EMPTY_CURSORS, getServerCursors, usePresenceContext } from "./use-presence-client.js";

/**
 * Returns the resolved remote cursors.
 * The hook rerenders on every new cursor snapshot.
 * Returns an empty list on the server or without a binding.
 */
export function useRemoteCursors<TContext = unknown, TUser = unknown>(): ResolvedCursor<TContext, TUser>[] {
  const { binding } = usePresenceContext<TContext, TUser>();
  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );
  const getSnapshot = useCallback(
    () => (binding !== null ? binding.getSnapshot() : (EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[])),
    [binding],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerCursors as () => ResolvedCursor<TContext, TUser>[],
  );
}

/**
 * Subscribes to the resolved-cursor snapshot through a selector, and rerenders only when the
 * selected value changes under `isEqual`. Keep `select` and `isEqual` stable across renders.
 */
export function useRemoteCursorsSelector<TSelected, TContext = unknown, TUser = unknown>(
  select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const { binding } = usePresenceContext<TContext, TUser>();
  const selectedRef = useRef<{ value: TSelected } | null>(null);
  // caches select's output by input array and callbacks, so a repeat snapshot probe skips select() entirely
  const lastInputRef = useRef<{
    cursors: ResolvedCursor<TContext, TUser>[];
    select: typeof select;
    isEqual: typeof isEqual;
    value: TSelected;
  } | null>(null);

  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );

  const getSnapshot = useCallback(() => {
    const cursors =
      binding !== null ? binding.getSnapshot() : (EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[]);
    const lastInput = lastInputRef.current;
    if (lastInput?.cursors === cursors && lastInput.select === select && lastInput.isEqual === isEqual) {
      return lastInput.value;
    }

    const next = select(cursors);
    const previous = selectedRef.current;
    // useSyncExternalStore compares by identity, so an equal selection must return the previous reference
    const value = previous !== null && isEqual(previous.value, next) ? previous.value : next;
    selectedRef.current = { value };
    lastInputRef.current = { cursors, select, isEqual, value };
    return value;
  }, [binding, select, isEqual]);

  // computed once: React may call the server snapshot repeatedly, and it compares by identity
  const [serverValue] = useState(() => select(EMPTY_CURSORS as ResolvedCursor<TContext, TUser>[]));
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

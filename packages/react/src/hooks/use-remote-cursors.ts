import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ResolvedCursor } from "@dammers/anchor-presence-dom";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { EMPTY_CURSORS, getServerCursors, usePresenceProviderContext } from "./use-presence-client.js";

export function useRemoteCursorsIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): readonly ResolvedCursor<TContext, TUser>[] {
  const { binding } = usePresenceProviderContext(context);
  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );
  const getSnapshot = useCallback(
    () => (binding !== null ? binding.getSnapshot() : EMPTY_CURSORS),
    [binding],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerCursors);
}

/**
 * Returns the resolved remote cursors.
 * The `user` and `context` of a cursor have the type `unknown`. For typed values, use `useRemoteCursors` from `createPresenceHooks`.
 * The hook rerenders on every new cursor snapshot.
 * Returns an empty list on the server or without a binding.
 */
export function useRemoteCursors(): readonly ResolvedCursor[] {
  return useRemoteCursorsIn(PresenceProviderContext);
}

export function useRemoteCursorsSelectorIn<TSelected, TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
  select: (cursors: readonly ResolvedCursor<TContext, TUser>[]) => TSelected,
  isEqual: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const { binding } = usePresenceProviderContext(context);
  const selectedRef = useRef<{ value: TSelected } | null>(null);
  // caches select's output by input array and callbacks, so a repeat snapshot probe skips select() entirely
  const lastInputRef = useRef<{
    cursors: readonly ResolvedCursor<TContext, TUser>[];
    select: typeof select;
    isEqual: typeof isEqual;
    value: TSelected;
  } | null>(null);

  const subscribe = useCallback(
    (listener: () => void) => (binding !== null ? binding.subscribe(listener) : () => {}),
    [binding],
  );

  const getSnapshot = useCallback(() => {
    const cursors = binding !== null ? binding.getSnapshot() : EMPTY_CURSORS;
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
  const [serverValue] = useState(() => select(EMPTY_CURSORS));
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Subscribes to the resolved-cursor snapshot through a selector, and rerenders only when the
 * selected value changes under `isEqual`. Keep `select` and `isEqual` stable across renders.
 * The `user` and `context` of a cursor have the type `unknown`. For typed values, use `useRemoteCursorsSelector` from `createPresenceHooks`.
 */
export function useRemoteCursorsSelector<TSelected>(
  select: (cursors: readonly ResolvedCursor[]) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean,
): TSelected {
  return useRemoteCursorsSelectorIn(PresenceProviderContext, select, isEqual);
}

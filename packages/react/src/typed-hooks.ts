import { createElement } from "react";
import type { ReactNode } from "react";
import type { EventMap, PeerChange, TypedRemoteEvent } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { createPresenceContext } from "./context.js";
import { CursorLayerIn } from "./cursor.js";
import type { CursorLayerProps } from "./cursor.js";
import { usePresenceProviderValue } from "./provider.js";
import type { PresenceProviderProps } from "./provider.js";
import { useDomBindingIn } from "./hooks/use-dom-binding.js";
import { useLocalContextIn } from "./hooks/use-local-context.js";
import { useLocalUserIn } from "./hooks/use-local-user.js";
import { usePeerChangesIn } from "./hooks/use-peer-changes.js";
import { usePresenceClientIn } from "./hooks/use-presence-client.js";
import { usePresenceStatusIn } from "./hooks/use-presence-status.js";
import { useRemoteCursorsIn, useRemoteCursorsSelectorIn } from "./hooks/use-remote-cursors.js";
import { useRemoteEventsIn } from "./hooks/use-remote-events.js";
import { useRemotePresenceIn } from "./hooks/use-remote-presence.js";
import { useRemoteUsersIn } from "./hooks/use-remote-users.js";
import { useSendEventIn } from "./hooks/use-send-event.js";

/**
 * Returns a provider, the hooks and a `CursorLayer` whose types follow the client you give that provider.
 * The hooks read only the provider of the same call, so a client of other types fails to compile.
 * Call it once at module level and export the result.
 */
export function createPresenceHooks<
  TContext = unknown,
  TUser = unknown,
  TEvents extends object = EventMap,
>() {
  const context = createPresenceContext<TContext, TUser, TEvents>();
  return {
    PresenceProvider: (props: PresenceProviderProps<TContext, TUser, TEvents>): ReactNode => {
      const value = usePresenceProviderValue(props);
      return createElement(context.Provider, { value }, props.children);
    },
    CursorLayer: (props: CursorLayerProps<TContext, TUser>): ReactNode =>
      createElement(CursorLayerIn<TContext, TUser, TEvents>, { ...props, context }),
    useDomBinding: () => useDomBindingIn(context),
    usePresenceClient: () => usePresenceClientIn(context),
    useLocalContext: () => useLocalContextIn(context),
    useRemoteEvents: (listener: (event: TypedRemoteEvent<TEvents>) => void): void =>
      useRemoteEventsIn(context, listener),
    useSendEvent: () => useSendEventIn(context),
    useLocalUser: () => useLocalUserIn(context),
    usePeerChanges: (listener: (change: PeerChange<TContext, TUser>) => void): void =>
      usePeerChangesIn(context, listener),
    useRemotePresence: () => useRemotePresenceIn(context),
    usePresenceStatus: () => usePresenceStatusIn(context),
    useRemoteCursors: () => useRemoteCursorsIn(context),
    useRemoteCursorsSelector: <TSelected>(
      select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
      isEqual?: (a: TSelected, b: TSelected) => boolean,
    ) => useRemoteCursorsSelectorIn(context, select, isEqual),
    useRemoteUsers: () => useRemoteUsersIn(context),
  };
}

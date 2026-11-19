import { useCallback, useRef, useSyncExternalStore } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { PresenceProviderContext } from "../context.js";
import type { PresenceContext } from "../context.js";
import { EMPTY_PRESENCE, usePresenceProviderContext } from "./use-presence-client.js";

/**
 * One remote user, keyed by client.
 */
export type RemoteUser<TUser = unknown> = {
  /** The client that sent the user value. */
  clientId: string;
  /** The user value, or `undefined` when the sender sent none or sent `null`. */
  user: TUser | undefined;
  /** The session ID of the client. */
  session: string;
  /** `true` when the presence of the client has not changed for `idleAfterMs`. */
  idle: boolean;
};

const EMPTY_USERS: never[] = [];

// Keeps each RemoteUser's identity across presence snapshots that change only cursor position,
// so a consumer rendering a user list does not re-render on every remote pointer move.
// The per-client map is updated in place; the users array is rebuilt only when membership,
// order, or a user-relevant field changes. Cursor-only probes allocate nothing.
function projectRemoteUsers<TContext, TUser>(
  snapshot: RemotePresence<TContext, TUser>[],
  previousUsers: RemoteUser<TUser>[],
  byClientId: Map<string, RemoteUser<TUser>>,
): RemoteUser<TUser>[] {
  let structureChanged = snapshot.length !== previousUsers.length;
  if (!structureChanged) {
    for (let i = 0; i < snapshot.length; i++) {
      const next = snapshot[i];
      const previous = previousUsers[i];
      if (next === undefined || previous === undefined || next.clientId !== previous.clientId) {
        structureChanged = true;
        break;
      }
    }
  }

  let fieldChanged = false;
  for (const presence of snapshot) {
    const user = presence.user === null ? undefined : presence.user;
    const previous = byClientId.get(presence.clientId);
    if (
      previous === undefined ||
      previous.user !== user ||
      previous.idle !== presence.idle ||
      previous.session !== presence.session
    ) {
      byClientId.set(presence.clientId, {
        clientId: presence.clientId,
        user,
        session: presence.session,
        idle: presence.idle,
      });
      fieldChanged = true;
    }
  }

  // prune clients that left the snapshot; O(n*m) but runs only when a client is gone
  if (byClientId.size > snapshot.length) {
    for (const clientId of Array.from(byClientId.keys())) {
      if (!snapshot.some((p) => p.clientId === clientId)) byClientId.delete(clientId);
    }
  }

  if (!structureChanged && !fieldChanged) return previousUsers;
  // every snapshot client has an entry: the update loop ran over the same snapshot right before
  const users: RemoteUser<TUser>[] = [];
  for (const presence of snapshot) {
    const user = byClientId.get(presence.clientId);
    if (user !== undefined) users.push(user);
  }
  return users;
}

export function useRemoteUsersIn<TContext, TUser, TEvents extends object>(
  context: PresenceContext<TContext, TUser, TEvents>,
): RemoteUser<TUser>[] {
  const { client } = usePresenceProviderContext(context);
  const previousUsersRef = useRef<RemoteUser<TUser>[]>([]);
  const byClientIdRef = useRef(new Map<string, RemoteUser<TUser>>());

  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );

  const getSnapshot = useCallback((): RemoteUser<TUser>[] => {
    const presence = client !== null ? client.getRemotePresence() : EMPTY_PRESENCE;
    const nextUsers = projectRemoteUsers(presence, previousUsersRef.current, byClientIdRef.current);
    previousUsersRef.current = nextUsers;
    return nextUsers;
  }, [client]);

  const getServerSnapshot = useCallback(() => EMPTY_USERS, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns the remote user values, one entry per client.
 * Each `user` has the type `unknown`. For typed users, use `useRemoteUsers` from `createPresenceHooks`.
 * The list, and each entry, keep identity across a presence snapshot that changes no user-relevant field.
 */
export function useRemoteUsers(): RemoteUser[] {
  return useRemoteUsersIn(PresenceProviderContext);
}

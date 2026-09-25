import { useCallback, useRef, useSyncExternalStore } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { EMPTY_PRESENCE, useLiveCursorContext } from "./use-cursor-client.js";

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
  /** `true` when the client sent no update for a while. */
  idle: boolean;
};

const EMPTY_USERS: RemoteUser[] = [];

function sameUser<TUser>(a: RemoteUser<TUser>, b: RemoteUser<TUser>): boolean {
  return (
    a.clientId === b.clientId && a.session === b.session && a.idle === b.idle && Object.is(a.user, b.user)
  );
}

function sameList<TUser>(a: RemoteUser<TUser>[], b: RemoteUser<TUser>[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

// keeps each RemoteUser's identity across presence snapshots that change only cursor position,
// so a consumer rendering a user list does not re-render on every remote pointer move
function projectRemoteUsers<TUser>(
  snapshot: RemotePresence<unknown, TUser>[],
  previousByClientId: Map<string, RemoteUser<TUser>>,
): { users: RemoteUser<TUser>[]; byClientId: Map<string, RemoteUser<TUser>> } {
  const byClientId = new Map<string, RemoteUser<TUser>>();
  const users = snapshot.map((p) => {
    const next: RemoteUser<TUser> = {
      clientId: p.clientId,
      user: p.user === null ? undefined : p.user,
      session: p.session,
      idle: p.idle,
    };
    const previous = previousByClientId.get(p.clientId);
    const user = previous !== undefined && sameUser(previous, next) ? previous : next;
    byClientId.set(p.clientId, user);
    return user;
  });
  return { users, byClientId };
}

/**
 * Returns the remote user values, one entry per client.
 * The list, and each entry, keep identity across a presence snapshot that changes no user-relevant field.
 */
export function useRemoteUsers<TUser = unknown>(): RemoteUser<TUser>[] {
  const { client } = useLiveCursorContext<unknown, TUser>();
  const previousUsersRef = useRef<RemoteUser<TUser>[]>([]);
  const byClientIdRef = useRef(new Map<string, RemoteUser<TUser>>());

  const subscribe = useCallback(
    (listener: () => void) => (client !== null ? client.subscribeRemote(listener) : () => {}),
    [client],
  );

  const getSnapshot = useCallback((): RemoteUser<TUser>[] => {
    const presence =
      client !== null ? client.getRemotePresence() : (EMPTY_PRESENCE as RemotePresence<unknown, TUser>[]);
    const { users, byClientId } = projectRemoteUsers(presence, byClientIdRef.current);
    const nextUsers = sameList(previousUsersRef.current, users) ? previousUsersRef.current : users;
    byClientIdRef.current = byClientId;
    previousUsersRef.current = nextUsers;
    return nextUsers;
  }, [client]);

  const getServerSnapshot = useCallback(() => EMPTY_USERS as RemoteUser<TUser>[], []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

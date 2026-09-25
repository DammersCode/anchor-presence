import { useMemo } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { useCursorPresence } from "./use-cursor-presence.js";

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

function projectRemoteUsers<TUser>(snapshot: RemotePresence<unknown, TUser>[]): RemoteUser<TUser>[] {
  return snapshot.map((p) => ({
    clientId: p.clientId,
    user: p.user === null ? undefined : p.user,
    session: p.session,
    idle: p.idle,
  }));
}

/**
 * Returns the remote user values, one entry per client.
 * The list follows the stable presence snapshot.
 */
export function useRemoteUsers<TUser = unknown>(): RemoteUser<TUser>[] {
  const presence = useCursorPresence<unknown, TUser>();
  return useMemo(() => projectRemoteUsers(presence), [presence]);
}

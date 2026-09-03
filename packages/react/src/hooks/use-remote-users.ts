import { useMemo } from "react";
import type { RemotePresence } from "@anchor-presence/core";
import { useCursorPresence } from "./use-cursor-presence";

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

import type {
  ConnectionStatus,
  EventMap,
  PresenceMessage,
  PresenceClient,
  RemotePresence,
} from "@dammers/anchor-presence-core";
import type { DomBinding, ResolvedCursor } from "@dammers/anchor-presence-dom";

// react's `act` needs this flag set; every jsdom test importing testUtils gets it without a shared vitest setupFiles entry.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function makeFakeClient<TContext = unknown, TUser = unknown, TEvents extends object = EventMap>(): {
  client: PresenceClient<TContext, TUser, TEvents>;
  pushRemote: (next: PresenceMessage<TContext, TUser>[], idleClientIds?: Set<string>) => void;
  setStatus: (status: ConnectionStatus) => void;
} {
  let remoteSnapshot: PresenceMessage<TContext, TUser>[] = [];
  let remotePresence: RemotePresence<TContext, TUser>[] = [];
  const remoteListeners = new Set<() => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connected";
  let context: TContext | undefined;
  let user: TUser | undefined;
  const teardowns: Array<() => void> = [];

  const client: PresenceClient<TContext, TUser, TEvents> = {
    clientId: "local",
    session: "s",
    setLocalCursor: () => {},
    setContext: (next) => {
      context = next;
    },
    getContext: () => context,
    subscribeContext: () => () => {},
    setUser: (next) => {
      user = next;
    },
    getUser: () => user,
    leave: () => {},
    subscribeClose: () => () => {},
    sendEvent: () => false,
    subscribeEvents: () => () => {},
    subscribeUser: () => () => {},
    subscribePeers: () => () => {},
    getStatus: () => status,
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getRemoteSnapshot: () => remoteSnapshot,
    getRemotePresence: () => remotePresence,
    subscribeRemote: (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    registerTeardown: (fn) => {
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },
    dispose: () => {
      for (const fn of teardowns.splice(0)) fn();
    },
  };

  return {
    client,
    pushRemote(next, idleClientIds = new Set()) {
      remoteSnapshot = next;
      remotePresence = next.map((presence) => {
        const projected: RemotePresence<TContext, TUser> = {
          version: presence.version,
          clientId: presence.clientId,
          session: presence.session,
          cursor: presence.cursor,
          idle: idleClientIds.has(presence.clientId),
        };
        if ("context" in presence) projected.context = presence.context;
        if ("user" in presence) projected.user = presence.user;
        if ("pointer" in presence) projected.pointer = presence.pointer;
        return projected;
      });
      for (const listener of remoteListeners) listener();
    },
    setStatus(next) {
      status = next;
      for (const listener of statusListeners) listener(next);
    },
  };
}

export function makeFakeBinding<TContext = unknown, TUser = unknown>(): {
  binding: DomBinding<TContext, TUser>;
  publish: (next: ResolvedCursor<TContext, TUser>[]) => void;
  notify: () => void;
  listenerCount: () => number;
} {
  let snapshot: ResolvedCursor<TContext, TUser>[] = [];
  const listeners = new Set<() => void>();

  const binding: DomBinding<TContext, TUser> = {
    invalidate: () => {},
    getSnapshot: () => snapshot,
    getAnchorElement: (id) => document.querySelector(`[data-anchor="${id}"]`),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      listeners.clear();
    },
  };

  return {
    binding,
    publish(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    // fires listeners without changing the snapshot array, like the scheduler's every-frame notify()
    notify() {
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

export const parserOf =
  <T>() =>
  (value: unknown): T | undefined =>
    value as T;

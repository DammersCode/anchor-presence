import type { ConnectionStatus, CursorPresence, PresenceClient } from "@anchor-presence/core";
import type { AnchorRegistry, DomBinding, ResolvedCursor } from "@anchor-presence/dom";

// react's `act` needs this flag set; every jsdom test importing testUtils gets it without a shared vitest setupFiles entry.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function makeFakeClient<TContext = unknown, TUser = unknown>(): {
  client: PresenceClient<TContext, TUser>;
  pushRemote: (next: CursorPresence<TContext, TUser>[]) => void;
  setStatus: (status: ConnectionStatus) => void;
} {
  let remoteSnapshot: CursorPresence<TContext, TUser>[] = [];
  const remoteListeners = new Set<() => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connected";
  let context: TContext | undefined;
  let user: TUser | undefined;
  const teardowns: Array<() => void> = [];

  const client: PresenceClient<TContext, TUser> = {
    clientId: "local",
    session: "s",
    updateLocalCursor: () => {},
    setContext: (next) => {
      context = next;
    },
    getContext: () => context,
    setUser: (next) => {
      user = next;
    },
    getUser: () => user,
    getStatus: () => status,
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getRemoteSnapshot: () => remoteSnapshot,
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
      for (const fn of teardowns.splice(0, teardowns.length)) fn();
    },
  };

  return {
    client,
    pushRemote(next) {
      remoteSnapshot = next;
      for (const listener of remoteListeners) listener();
    },
    setStatus(next) {
      status = next;
      for (const listener of statusListeners) listener(next);
    },
  };
}

export function makeFakeRegistry(): AnchorRegistry & { registrations: Map<string, Element> } {
  const registrations = new Map<string, Element>();
  const changeListeners = new Set<() => void>();

  return {
    registrations,
    register(id, element) {
      registrations.set(id, element);
      for (const listener of changeListeners) listener();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (registrations.get(id) === element) {
          registrations.delete(id);
          for (const listener of changeListeners) listener();
        }
      };
    },
    get(id) {
      return registrations.get(id) ?? null;
    },
    has(id) {
      return registrations.has(id);
    },
    ancestors() {
      return [];
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}

export function makeFakeBinding<TContext = unknown, TUser = unknown>(): {
  binding: DomBinding<TContext, TUser>;
  publish: (next: ResolvedCursor<TContext, TUser>[]) => void;
  registry: AnchorRegistry & { registrations: Map<string, Element> };
  listenerCount: () => number;
} {
  const registry = makeFakeRegistry();
  let snapshot: ResolvedCursor<TContext, TUser>[] = [];
  const listeners = new Set<() => void>();

  const binding: DomBinding<TContext, TUser> = {
    registry,
    invalidate: () => {},
    getSnapshot: () => snapshot,
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
    registry,
    publish(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

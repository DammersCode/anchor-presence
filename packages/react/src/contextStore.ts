import type { PresenceClient } from "@anchor-presence/core";

// Reads through to the client so the initial `context` option and direct writes stay visible.
type ContextStore<TContext> = {
  getSnapshot(): TContext | undefined;
  subscribe(listener: () => void): () => void;
  setContext(next: TContext | undefined): void;
};

const stores = new WeakMap<PresenceClient, ContextStore<unknown>>();

function createContextStore<TContext, TUser>(
  client: PresenceClient<TContext, TUser>,
): ContextStore<TContext> {
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => client.getContext(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setContext(next) {
      client.setContext(next);
      for (const listener of listeners) listener();
    },
  };
}

export function getContextStore<TContext, TUser>(
  client: PresenceClient<TContext, TUser>,
): ContextStore<TContext> {
  const existing = stores.get(client);
  if (existing !== undefined) return existing as ContextStore<TContext>;
  const created = createContextStore(client);
  stores.set(client, created);
  return created;
}

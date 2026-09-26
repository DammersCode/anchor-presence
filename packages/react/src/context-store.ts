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
  // the client is the single notify source so a direct client.setContext() also reaches subscribers
  return {
    getSnapshot: () => client.getContext(),
    subscribe(listener) {
      return client.subscribeContext(listener);
    },
    setContext(next) {
      client.setContext(next);
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

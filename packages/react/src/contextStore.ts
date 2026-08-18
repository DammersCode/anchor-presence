import type { PresenceClient } from "@anchor-presence/core";

// core's setContext is write-only (spec §7/§12); this mirrors the last-set value so useCursorContext can read it back.
type ContextStore<TContext> = {
  getSnapshot(): TContext | undefined;
  subscribe(listener: () => void): () => void;
  setContext(next: TContext | undefined): void;
};

const stores = new WeakMap<PresenceClient<unknown, unknown>, ContextStore<unknown>>();

function createContextStore<TContext, TUser>(
  client: PresenceClient<TContext, TUser>,
): ContextStore<TContext> {
  let value: TContext | undefined;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setContext(next) {
      value = next;
      client.setContext(next);
      for (const listener of listeners) listener();
    },
  };
}

export function getContextStore<TContext, TUser>(
  client: PresenceClient<TContext, TUser>,
): ContextStore<TContext> {
  const existing = stores.get(client as PresenceClient<unknown, unknown>);
  if (existing !== undefined) return existing as ContextStore<TContext>;
  const created = createContextStore(client);
  stores.set(client as PresenceClient<unknown, unknown>, created as ContextStore<unknown>);
  return created;
}

import type { PresenceClient } from "@anchor-presence/core";

type ContextStore<TContext> = {
  getSnapshot(): TContext | undefined;
  subscribe(listener: () => void): () => void;
  setContext(next: TContext | undefined): void;
};

export function getContextStore<TContext, TUser, TEvents extends object>(
  client: PresenceClient<TContext, TUser, TEvents>,
): ContextStore<TContext> {
  // the client is the single notify source so a direct client.setContext() also reaches subscribers
  return {
    getSnapshot: () => client.getContext(),
    subscribe: (listener) => client.subscribeContext(listener),
    setContext: (next) => client.setContext(next),
  };
}

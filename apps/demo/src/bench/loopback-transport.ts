// injectInbound runs the real codec/validate/store/resolver pipeline, not store internals
import type { PresenceTransport } from "@anchor-presence/core";

export type LoopbackTransport = PresenceTransport & {
  injectInbound(data: Uint8Array): void;
};

export function createLoopbackTransport(): LoopbackTransport {
  const listeners = new Set<(data: Uint8Array) => void>();

  return {
    send() {
      // benchmark never needs outbound delivery
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    injectInbound(data) {
      for (const listener of listeners) listener(data);
    },
  };
}

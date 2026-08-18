// In-process transport for the benchmark: no network, send() is a no-op, and injectInbound()
// feeds synthetic remote presence bytes straight to the client's decode path — exercises the
// real codec/validate/store/resolver pipeline instead of poking store internals directly.
import type { LiveCursorTransport } from "@anchor-presence/core";

export type LoopbackTransport = LiveCursorTransport & {
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

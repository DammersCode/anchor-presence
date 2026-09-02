import type { ConnectionStatus } from "./protocol";
import type { LiveCursorTransport } from "./transport";

// A wire-connected 2-peer mesh for tests that run without a browser or a relay.
// send on one side delivers to the OTHER side's subscribers only (the "relay to the
// other peer" model); the client does the encode/decode and validation.

export type InMemoryPairOptions = {
  /** Route delivery through a microtask so callers can interleave. Default false (synchronous). */
  async?: boolean;
};

export type InMemoryPair = {
  /** Feed it to client A (send goes A → B). */
  a: LiveCursorTransport;
  /** Feed it to client B (send goes B → A). */
  b: LiveCursorTransport;
  /** Tear down both sides and stop delivery. */
  dispose(): void;
};

type Side = {
  status: ConnectionStatus;
  listeners: Set<(data: Uint8Array) => void>;
  statusListeners: Set<(status: ConnectionStatus) => void>;
};

function setStatus(side: Side, next: ConnectionStatus): void {
  if (side.status === next) return;
  side.status = next;
  for (const listener of side.statusListeners) listener(next);
}

export function createInMemoryPair(options: InMemoryPairOptions = {}): InMemoryPair {
  const isAsync = options.async === true;

  const a: Side = { status: "disconnected", listeners: new Set(), statusListeners: new Set() };
  const b: Side = { status: "disconnected", listeners: new Set(), statusListeners: new Set() };

  let disposed = false;

  function deliver(to: Side, data: Uint8Array): void {
    if (disposed) return;
    if (isAsync) {
      queueMicrotask(() => {
        if (disposed) return;
        for (const listener of to.listeners) listener(data);
      });
    } else {
      for (const listener of to.listeners) listener(data);
    }
  }

  function buildTransport(self: Side, other: Side): LiveCursorTransport {
    return {
      connect() {
        setStatus(self, "connected");
      },
      disconnect() {
        setStatus(self, "disconnected");
      },
      send(data) {
        deliver(other, data);
      },
      subscribe(listener) {
        self.listeners.add(listener);
        return () => {
          self.listeners.delete(listener);
        };
      },
      subscribeStatus(listener) {
        listener(self.status);
        self.statusListeners.add(listener);
        return () => {
          self.statusListeners.delete(listener);
        };
      },
      getStatus() {
        return self.status;
      },
    };
  }

  return {
    a: buildTransport(a, b),
    b: buildTransport(b, a),
    dispose() {
      disposed = true;
      a.listeners.clear();
      b.listeners.clear();
      a.statusListeners.clear();
      b.statusListeners.clear();
    },
  };
}

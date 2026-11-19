import type { ConnectionStatus } from "./protocol.js";
import type { PresenceTransport } from "./transport.js";

/**
 * Options for `createInMemoryPair`.
 */
export type InMemoryPairOptions = {
  /** Deliver messages in a microtask instead of at once. Default `false` (synchronous). */
  async?: boolean;
};

/** A `PresenceTransport` whose optional lifecycle and status members are always present. */
export type InMemoryTransport = PresenceTransport & {
  connect(): void;
  disconnect(): void;
  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void;
  getStatus(): ConnectionStatus;
};

/**
 * Two in-memory transports wired to each other.
 * Each client takes one side.
 */
export type InMemoryPair = {
  /** Side A. A send from side A reaches the listeners of side B. */
  a: InMemoryTransport;
  /** Side B. A send from side B reaches the listeners of side A. */
  b: InMemoryTransport;
  /** Stops all delivery and clears both sides. */
  dispose(): void;
};

/**
 * Any number of in-memory transports that share one channel.
 */
export type InMemoryRoom = {
  /** Returns a new connected transport. Each send reaches every other connected transport. */
  join(): InMemoryTransport;
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

/**
 * Creates two in-memory transports wired to each other.
 * A send on one side reaches the listeners of the other side only.
 * The pair is for tests that run without a browser or a relay.
 * @param options Optional settings. Omit for synchronous delivery.
 * @returns A pair with one transport per side.
 */
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

  function buildTransport(self: Side, other: Side): InMemoryTransport {
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

/**
 * Creates a room of in-memory transports.
 * A send from one transport reaches every other connected transport, never the sender.
 * @param options Optional settings. Omit for synchronous delivery.
 * @returns A room. Call `join()` once per peer.
 */
export function createInMemoryRoom(options: InMemoryPairOptions = {}): InMemoryRoom {
  const isAsync = options.async === true;
  const sides = new Set<Side>();

  function deliver(from: Side, data: Uint8Array): void {
    if (from.status !== "connected") return;
    for (const to of sides) {
      if (to === from) continue;
      const receive = (): void => {
        if (to.status !== "connected") return;
        for (const listener of to.listeners) listener(data);
      };
      if (isAsync) queueMicrotask(receive);
      else receive();
    }
  }

  return {
    join() {
      const self: Side = { status: "connected", listeners: new Set(), statusListeners: new Set() };
      sides.add(self);
      return {
        connect() {
          setStatus(self, "connected");
        },
        disconnect() {
          setStatus(self, "disconnected");
        },
        send(data) {
          deliver(self, data);
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
    },
  };
}

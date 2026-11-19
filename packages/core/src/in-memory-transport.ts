import type { ConnectionStatus } from "./protocol.js";
import type { PresenceTransport } from "./transport.js";
import { reportListenerError } from "./internal/dev-warnings.js";

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
  /** Returns a new connected transport, or a disconnected one after `dispose()`. Each send reaches every other connected transport. */
  join(): InMemoryTransport;
  /** Disconnects every joined transport, clears their listeners and stops delivery. */
  dispose(): void;
};

/** Options for `createInMemoryRoom`. */
export type InMemoryRoomOptions = InMemoryPairOptions;

type Side = {
  status: ConnectionStatus;
  listeners: Set<(data: Uint8Array) => void>;
  statusListeners: Set<(status: ConnectionStatus) => void>;
};

function newSide(status: ConnectionStatus): Side {
  return { status, listeners: new Set(), statusListeners: new Set() };
}

function setStatus(side: Side, next: ConnectionStatus): void {
  if (side.status === next) return;
  side.status = next;
  for (const listener of side.statusListeners) listener(next);
}

function clearSide(side: Side): void {
  side.listeners.clear();
  side.statusListeners.clear();
}

function buildTransport(
  self: Side,
  send: (data: Uint8Array) => void,
  onStatus: () => void = () => {},
): InMemoryTransport {
  const change = (next: ConnectionStatus): void => {
    setStatus(self, next);
    onStatus();
  };
  return {
    connect: () => change("connected"),
    disconnect: () => change("disconnected"),
    send,
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
    getStatus: () => self.status,
  };
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
  const a = newSide("disconnected");
  const b = newSide("disconnected");
  let disposed = false;

  function deliver(to: Side, data: Uint8Array): void {
    if (disposed) return;
    if (isAsync) {
      queueMicrotask(() => {
        if (!disposed) notify(to, data);
      });
    } else {
      notify(to, data);
    }
  }

  const guarded = (transport: InMemoryTransport): InMemoryTransport => ({
    ...transport,
    connect() {
      if (!disposed) void transport.connect();
    },
  });

  return {
    a: guarded(buildTransport(a, (data) => deliver(b, data))),
    b: guarded(buildTransport(b, (data) => deliver(a, data))),
    dispose() {
      disposed = true;
      clearSide(a);
      clearSide(b);
    },
  };
}

function notify(to: Side, data: Uint8Array): void {
  for (const listener of to.listeners) {
    try {
      listener(data);
    } catch (error) {
      reportListenerError(error);
    }
  }
}

function receive(to: Side, data: Uint8Array): void {
  if (to.status === "connected") notify(to, data);
}

/**
 * Creates a room of in-memory transports.
 * A send from one transport reaches every other connected transport, never the sender.
 * A listener that throws is reported and does not stop delivery to the other transports.
 * @param options Optional settings. Omit for synchronous delivery.
 * @returns A room. Call `join()` once per peer.
 */
export function createInMemoryRoom(options: InMemoryRoomOptions = {}): InMemoryRoom {
  const isAsync = options.async === true;
  const all = new Set<Side>();
  const connected = new Set<Side>();
  let disposed = false;

  return {
    join() {
      const self = newSide(disposed ? "disconnected" : "connected");
      if (!disposed) {
        all.add(self);
        connected.add(self);
      }
      const transport = buildTransport(
        self,
        (data) => {
          if (disposed || self.status !== "connected" || !all.has(self)) return;
          for (const to of Array.from(connected)) {
            if (to === self) continue;
            if (isAsync) queueMicrotask(() => receive(to, data));
            else receive(to, data);
          }
        },
        () => {
          if (!disposed && self.status === "connected" && all.has(self)) connected.add(self);
          else connected.delete(self);
        },
      );
      return {
        ...transport,
        connect() {
          if (!disposed) void transport.connect();
        },
      };
    },
    dispose() {
      disposed = true;
      for (const side of all) {
        setStatus(side, "disconnected");
        clearSide(side);
      }
      all.clear();
      connected.clear();
    },
  };
}

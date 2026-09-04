import type { ConnectionStatus } from "../protocol.js";
import type { PublishLoop } from "./publish-loop.js";
import type { PresenceClientState } from "./types.js";

/**
 * Connection status tracking for one presence client.
 * Tracks the transport status, republishes the full state when the
 * transport reconnects, and notifies the status listeners.
 */
export type StatusMachine = {
  /** Adds a listener for connection status changes. Returns an unsubscribe function. */
  subscribeStatus: (listener: (status: ConnectionStatus) => void) => () => void;
  /** Subscribes to the transport status channel and registers its unsubscribe. */
  wireTransport: () => void;
  /** Moves the status to "disconnected" on dispose and clears the listeners. */
  dispose: () => void;
};

export function createStatusMachine<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
  publish: Pick<PublishLoop, "markReconnected">,
): StatusMachine {
  const listeners = new Set<(status: ConnectionStatus) => void>();

  function setStatus(next: ConnectionStatus): void {
    if (state.status === next) return;
    state.status = next;
    // republish before listener fan-out so a throwing listener cannot kill the guarantee
    if (state.status === "connected") {
      publish.markReconnected();
    }
    for (const listener of listeners) {
      try {
        listener(state.status);
      } catch {
        // one throwing listener must not starve the rest
      }
    }
  }

  function wireTransport(): void {
    if (state.transport.subscribeStatus) {
      const unsubscribeStatus = state.transport.subscribeStatus((next) => setStatus(next));
      state.teardowns.push(unsubscribeStatus);
    }
  }

  function dispose(): void {
    if (state.status !== "disconnected") {
      state.status = "disconnected";
      for (const listener of listeners) {
        try {
          listener(state.status);
        } catch {
          // one throwing listener must not starve the rest
        }
      }
    }
    listeners.clear();
  }

  function subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { subscribeStatus, wireTransport, dispose };
}

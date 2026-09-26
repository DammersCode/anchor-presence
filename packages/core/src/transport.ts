import type { ConnectionStatus } from "./protocol.js";

export type { ConnectionStatus } from "./protocol.js";

/**
 * Byte channel that moves messages between the client and a network.
 * A transport never validates messages. The client runs `validatePresence` on inbound data.
 */
export interface LiveCursorTransport {
  /** Opens the connection. */
  connect?(): Promise<void> | void;
  /** Closes the connection. */
  disconnect?(): Promise<void> | void;
  /**
   * Sends one encoded message.
   * The transport can drop a message when the connection is not open.
   */
  send(data: Uint8Array): Promise<void> | void;
  /**
   * Adds a listener for inbound messages.
   * @returns A function that removes the listener.
   */
  subscribe(listener: (data: Uint8Array) => void): () => void;
  /**
   * Adds a listener for connection status changes.
   * The transport replays the current status to a new listener.
   * @returns A function that removes the listener.
   */
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
  /** Returns the current connection status. */
  getStatus?(): ConnectionStatus;
  /**
   * Returns the number of bytes queued for send.
   * The client uses this value for the adaptive publish rate.
   */
  bufferedBytes?(): number;
}

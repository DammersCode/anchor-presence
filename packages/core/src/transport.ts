import type { ConnectionStatus } from "./protocol.js";

/** Why a connection closed, as the transport reports it. */
export type TransportClose = {
  /** The close code the relay sent, for example `4006` for a rejected token. */
  code?: number;
  /** The close reason text, when the relay sent one. */
  reason?: string;
  /** `true` when the transport schedules another attempt. */
  willReconnect: boolean;
};

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
  /**
   * Adds a listener that runs each time a connection closes, with the reason.
   * @returns A function that removes the listener.
   */
  subscribeClose?(listener: (close: TransportClose) => void): () => void;
  /** Returns the current connection status. */
  getStatus?(): ConnectionStatus;
  /**
   * Returns the number of bytes queued for send.
   * The client uses this value for the adaptive publish rate.
   */
  bufferedBytes?(): number;
}

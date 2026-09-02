import type { ConnectionStatus } from "./protocol";

export type { ConnectionStatus } from "./protocol";

// Transport abstraction — spec §5. Core never imports a transport implementation.
export interface LiveCursorTransport {
  connect?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
  send(data: Uint8Array): Promise<void> | void;
  subscribe(listener: (data: Uint8Array) => void): () => void;
  // subscribeStatus SHOULD replay the current status to a new subscriber (spec §5)
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
  getStatus?(): ConnectionStatus;
  /** Bytes currently queued by the transport; used only for opt-in adaptive publish rate. */
  bufferedBytes?(): number;
}

import type { ConnectionStatus, LiveCursorTransport, TransportClose } from "@anchor-presence/core";
import type { Socket } from "socket.io-client";

/** Normalizes Socket.IO's binary payload shape across Node and browser clients. */
function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

export function createSocketIoTransport(socket: Socket): LiveCursorTransport {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = socket.connected ? "connected" : "connecting";

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  };

  const closeListeners = new Set<(close: TransportClose) => void>();
  let refusal: { code?: number; reason?: string } | undefined;
  const emitClose = (close: TransportClose) => {
    for (const listener of closeListeners) {
      try {
        listener(close);
      } catch {
        // a throwing listener must not stop the status update
      }
    }
  };

  socket.on("refused", (info: { code?: number; reason?: string }) => {
    refusal = info;
  });
  socket.on("connect", () => {
    refusal = undefined;
    setStatus("connected");
  });
  socket.on("disconnect", (reason: string) => {
    const close: TransportClose = { willReconnect: socket.active };
    if (refusal?.code !== undefined) close.code = refusal.code;
    close.reason = refusal?.reason ?? reason;
    emitClose(close);
    setStatus("disconnected");
  });
  socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
  // an auth or origin refusal stops the client from retrying: report it instead of staying at "connecting"
  socket.on("connect_error", (error: Error & { data?: { code?: number } }) => {
    const close: TransportClose = { reason: error.message, willReconnect: socket.active };
    if (error.data?.code !== undefined) close.code = error.data.code;
    emitClose(close);
    setStatus(socket.active ? "reconnecting" : "disconnected");
  });

  return {
    connect: () => {
      if (!socket.connected) socket.connect();
    },
    disconnect: () => {
      socket.disconnect();
    },
    send: (data) => {
      socket.emit("presence", data);
    },
    subscribe: (listener) => {
      const handler = (data: unknown) => {
        const bytes = toUint8Array(data);
        if (bytes !== null) listener(bytes);
      };
      socket.on("presence", handler);
      return () => socket.off("presence", handler);
    },
    getStatus: () => status,
    subscribeClose: (listener) => {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status);
      return () => statusListeners.delete(listener);
    },
  };
}

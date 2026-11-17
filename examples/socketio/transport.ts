import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";
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

  socket.on("connect", () => setStatus("connected"));
  socket.on("disconnect", () => setStatus("disconnected"));
  socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
  // an auth or origin refusal stops the client from retrying: report it instead of staying at "connecting"
  socket.on("connect_error", () => setStatus(socket.active ? "reconnecting" : "disconnected"));

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
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status);
      return () => statusListeners.delete(listener);
    },
  };
}

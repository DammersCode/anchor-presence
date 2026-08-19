import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";
import type { Socket } from "socket.io-client";

/** Normalizes Socket.IO's binary payload shape across Node and browser clients. */
function toUint8Array(data: ArrayBuffer | Uint8Array | Buffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

export function createSocketIoTransport(socket: Socket): LiveCursorTransport {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const setStatus = (next: ConnectionStatus) => {
    for (const listener of statusListeners) listener(next);
  };

  socket.on("connect", () => setStatus("connected"));
  socket.on("disconnect", () => setStatus("disconnected"));
  socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));

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
      const handler = (data: ArrayBuffer | Uint8Array | Buffer) => listener(toUint8Array(data));
      socket.on("presence", handler);
      return () => socket.off("presence", handler);
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
}

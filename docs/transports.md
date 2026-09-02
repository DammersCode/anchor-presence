# Transports

Core imports no transport library (Invariant 6). An application supplies a transport that implements `LiveCursorTransport`. This page shows the interface and the example implementations. The native WebSocket transport ships in `@anchor-presence/dom` with automatic reconnect and exponential backoff.

## The LiveCursorTransport interface

```ts
import type { LiveCursorTransport, ConnectionStatus } from "@anchor-presence/core";

interface LiveCursorTransport {
  connect?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
  send(data: Uint8Array): Promise<void> | void;
  subscribe(listener: (data: Uint8Array) => void): () => void;
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
  getStatus?(): ConnectionStatus;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
```

Rules:

- `send` receives already-encoded bytes. The client calls `codec.encode()` before calling `send`.
- `subscribe` receives already-encoded bytes from the wire. The client calls `codec.decode()` and `validatePresence()` after your listener fires.
- `connect`, `disconnect`, `subscribeStatus`, and `getStatus` are optional. When a transport omits `subscribeStatus`, the client reports a constant `"connected"` status.
- `subscribeStatus` SHOULD replay the current status to every new subscriber. Without a replay, a client that subscribes after the connection opened never learns it can send. All examples below replay.
- `getStatus` returns the current status. The client reads it once at creation for its initial status; without it, the client starts at `"connecting"` until the first status callback.
- A `send` failure must not throw past the transport boundary in a way that crashes the app. The client swallows send errors after a status check; presence is lossy by design.

Pass a transport instance to `createPresenceClient`:

```ts
import { createPresenceClient } from "@anchor-presence/core";

const client = createPresenceClient({ transport: myTransport });
```

## Native WebSocket example

`@anchor-presence/dom` ships `createWebSocketTransport`. The function is unit-tested and reconnects with exponential backoff. It matches the room-broadcast relay in `apps/server/index.ts`. That relay forwards every binary message to the other sockets in the same room.

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ path: "/?room=main" });
transport.connect();
const client = createPresenceClient({ transport });
```

The default URL is `ws(s)://<current host>:8787/`. Room grouping is a relay/server concern, not part of the core protocol. If your relay uses rooms, pass a `url` or `path` such as `/?room=main`. Pass `reconnect: false` to turn off automatic reconnect. Pass `baseBackoffMs` and `maxBackoffMs` to change the backoff. Pass `WebSocketCtor` to inject a WebSocket constructor for tests.

The Socket.IO and SignalR adapters stay in `examples/`. They need foreign dependencies. Only the native WebSocket transport is part of the library.

## Socket.IO adapter

`examples/socketio/transport.ts` has a tested `createSocketIoTransport(socket)` adapter. An
integration test in `examples/socketio/socketio.test.ts` runs it against a real Socket.IO
server and checks that a cursor update reaches a second client. The version below adds
status replay and `getStatus`:

```ts
import type { ConnectionStatus, LiveCursorTransport } from "@anchor-presence/core";
import type { Socket } from "socket.io-client";

export function createSocketIoTransport(socket: Socket): LiveCursorTransport {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = socket.connected ? "connected" : "connecting";
  const setStatus = (next: ConnectionStatus) => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  socket.on("connect", () => setStatus("connected"));
  socket.on("disconnect", () => setStatus("disconnected"));
  socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));

  return {
    connect: () => {
      if (!socket.connected) socket.connect();
    },
    disconnect: () => socket.disconnect(),
    send: (data) => socket.emit("presence", data),
    subscribe: (listener) => {
      const handler = (data: ArrayBuffer | Uint8Array | Buffer) =>
        listener(data instanceof Uint8Array ? data : new Uint8Array(data));
      socket.on("presence", handler);
      return () => socket.off("presence", handler);
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status); // replay so a late subscriber sees the current state
      return () => statusListeners.delete(listener);
    },
    getStatus: () => status,
  };
}
```

See `examples/socketio/README.md` for the matching relay server and setup steps.

## SignalR adapter sketch

This is a sketch, not tested. It targets `@microsoft/signalr` 8.x. Make sure it works against a real
hub before you ship it.

```ts
import type { LiveCursorTransport, ConnectionStatus } from "@anchor-presence/core";
import type { HubConnection } from "@microsoft/signalr";

export function createSignalRTransport(connection: HubConnection): LiveCursorTransport {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connecting";
  const setStatus = (next: ConnectionStatus) => {
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  // withAutomaticReconnect() on the builder is required, or a drop goes straight to onclose
  connection.onreconnecting(() => setStatus("reconnecting"));
  connection.onreconnected(() => setStatus("connected"));
  connection.onclose(() => setStatus("disconnected"));

  return {
    connect: async () => {
      setStatus("connecting");
      await connection.start();
      setStatus("connected");
    },
    disconnect: () => connection.stop(),
    send: (data) => connection.send("Presence", data),
    subscribe: (listener) => {
      // connection.on passes hub method args positionally; Presence has one arg
      const handler = (data: Uint8Array) => listener(data);
      connection.on("Presence", handler);
      return () => connection.off("Presence", handler);
    },
    subscribeStatus: (listener) => {
      statusListeners.add(listener);
      listener(status); // replay so a late subscriber sees the current state
      return () => statusListeners.delete(listener);
    },
    getStatus: () => status,
  };
}
```

Build the connection with `HubConnectionBuilder` and `withAutomaticReconnect()`:

```ts
import { HubConnectionBuilder } from "@microsoft/signalr";

const connection = new HubConnectionBuilder()
  .withUrl("https://your-server.example/presenceHub")
  .withAutomaticReconnect()
  .build();
```

### Binary payloads need the MessagePack hub protocol

The default JSON hub protocol serializes a `Uint8Array` argument with `JSON.stringify`. This
turns the bytes into an object of numbered keys, not a compact binary payload. A plain .NET
hub parameter of type `byte[]` will not decode this object correctly.

Add the MessagePack hub protocol on both client and server for a correct and compact binary
transfer:

```ts
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";

const connection = new HubConnectionBuilder()
  .withUrl("https://your-server.example/presenceHub")
  .withHubProtocol(new MessagePackHubProtocol())
  .withAutomaticReconnect()
  .build();
```

The MessagePack protocol encodes a `Uint8Array` as a MessagePack `bin` value. A .NET hub
method with a `byte[]` parameter decodes it directly, with no manual base64 step.

## BroadcastChannel example

`BroadcastChannel` needs no server. It works only between tabs in the same browser, on the same origin. Use it for local development and demos.

```ts
import type { LiveCursorTransport } from "@anchor-presence/core";

export function createBroadcastChannelTransport(channelName: string): LiveCursorTransport {
  const channel = new BroadcastChannel(channelName);

  return {
    send: (data) => channel.postMessage(data),
    subscribe: (listener) => {
      const handler = (event: MessageEvent<Uint8Array>) => listener(event.data);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
  };
}
```

`BroadcastChannel` has no `subscribeStatus`, so the client reports a constant `"connected"` status. This transport needs no relay server, so it is a good choice for testing two-tab scenarios locally before wiring up a real backend.

## Testing without a browser

`createInMemoryPair` in `@anchor-presence/core` wires two clients together in memory. It needs no server, no browser, and no DOM. Use it in node unit tests to feed one client and read the other.

```ts
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";

const { a, b } = createInMemoryPair();
const clientA = createPresenceClient({ transport: a });
const clientB = createPresenceClient({ transport: b });
a.connect();
clientA.updateLocalCursor({ anchors: [{ id: "x", u: 0.5, v: 0.5 }] });
// after the publish interval, clientB.getRemoteSnapshot() holds client A's cursor
```

It is exactly a two-peer mesh: `send` on one side reaches only the other side's subscribers. The client does the `encode` and `validate`, so the pair stays a thin pipe. Pass `async: true` to route delivery through a microtask. Call `dispose()` to stop delivery.

## Reconnection and status

Core does not implement reconnection. A transport that needs to reconnect must do so internally and call its status listeners as the connection state changes:

- Report `"connecting"` while the first connection attempt is in progress.
- Report `"connected"` once open.
- Report `"reconnecting"` while attempting to restore a dropped connection.
- Report `"disconnected"` when no further automatic attempt will happen.
- Replay the current status to every new `subscribeStatus` subscriber, and implement `getStatus` so the client starts with the right status.

The presence client sends only while the status is `"connected"`. On every transition into `"connected"` it republishes the latest local state, so receivers catch up without waiting for a pointer move.

A reconnected client keeps its `clientId`. It generates a new `session` value only at client creation, not on reconnect, so the receiver's sequencing rules treat resumed traffic as a continuation, not a restart.

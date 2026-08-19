# Socket.IO transport example

This example shows a `LiveCursorTransport` for Socket.IO. It has two parts:

- `transport.ts`: `createSocketIoTransport(socket)`. It wraps a Socket.IO client socket.
- `server.ts`: `createSocketIoRelay(port)`. It relays `"presence"` events to other sockets in the same room.

## Run the integration test

The test in `socketio.test.ts` starts a real relay on an ephemeral port. It connects two Socket.IO
clients, sends a cursor update from one, and checks that the other client receives it through
`getRemoteSnapshot()`.

```sh
bunx vitest run --project socketio-example
```

## Use the transport in your app

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { io } from "socket.io-client";
import { createSocketIoTransport } from "./transport";

const socket = io("https://your-server.example", { query: { room: "main" } });
const client = createPresenceClient({ transport: createSocketIoTransport(socket) });
```

## Room routing

The relay reads the room name from the client's handshake query (`?room=main`). Change
`roomFor` logic in `server.ts` if your app picks rooms a different way, for example from an
authenticated session.

## Binary payloads

Socket.IO delivers binary data as `ArrayBuffer` in browsers and as `Buffer` in Node.
`transport.ts` normalizes both to `Uint8Array` before it calls the presence client.

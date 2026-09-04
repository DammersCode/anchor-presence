# Socket.IO transport example

This example adds a Socket.IO transport to the demo. It has three parts:

- `transport.ts`: wraps a Socket.IO client socket as a `LiveCursorTransport`.
- `server.ts` / `relay.ts`: a minimal Socket.IO server. It relays `"presence"` events to the other sockets in a room.
- `client/`: the same demo page as `apps/demo`.

Only the backend changes. The client builds its presence client over `createSocketIoTransport` instead of a plain WebSocket. The UI still uses the same `@anchor-presence/react` hooks, so the cursor behavior is unchanged.

## Start the relay

The repository root needs `bun install` once. Then:

```sh
cd examples/socketio
bun run dev:relay
```

The relay listens on <http://localhost:5001>. It needs no further setup.

## Start the client

```sh
cd examples/socketio/client
bun run dev
```

The client serves at <http://localhost:5174/>. Open that address in two browser windows.

If you want multiple room lanes, add `?room=<name>` to both addresses. The default room is `main`. Add `?name=<name>` to change the cursor label.

## What the demo shows

Move the pointer in one window and the other window draws the same cursor on the same element, even at a different width. See the [root README](../../README.md) for the core idea.

## Run the integration tests

The test in `socketio.test.ts` starts a real relay on an ephemeral port. It connects two Socket.IO clients, sends a cursor update from one, and checks that the other client receives it through `getRemoteSnapshot()`. Run it from the repository root:

```sh
bunx vitest run --project socketio-example
```

## Use the transport in your app

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { io } from "socket.io-client";
import { createSocketIoTransport } from "./transport";

const socket = io("https://your-server.example", { query: { room: "main" } });
const client = createPresenceClient({
  transport: createSocketIoTransport(socket),
});
```

## Room routing

The relay reads the room name from the handshake query of the client (`?room=main`). If your app picks rooms a different way, for example from an authenticated session, change the room lookup at the top of `createSocketIoRelay` in `server.ts`.

## Binary payloads

Socket.IO delivers binary data as `ArrayBuffer` in browsers and as `Buffer` in Node. `transport.ts` normalizes both to `Uint8Array` before it calls the presence client.

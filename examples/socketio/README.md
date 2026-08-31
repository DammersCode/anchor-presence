# Socket.IO transport example

This example shows a `LiveCursorTransport` for Socket.IO. It has three parts:

- `transport.ts`: `createSocketIoTransport(socket)`. It wraps a Socket.IO client socket.
- `server.ts` / `relay.ts`: a minimal Socket.IO server. It relays `"presence"` events to other
  sockets in the same room.
- `client/`: a Vite + React app. It renders live cursors on a demo page, anchored to semantic
  elements.

The `client/` page is the same demo page as `apps/demo`. Only the backend is different: the app
calls `getPresenceClient()`, which builds the presence client over `createSocketIoTransport`
instead of a plain WebSocket. The rest of the UI calls the same `@anchor-presence/react` hooks,
so the live cursor behavior is unchanged.

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

Add `?room=<name>` to both addresses when you want multiple room lanes. The default room is
`main`. Add `?name=<name>` to change the cursor label.

## What the demo shows

Move the pointer inside the page in one window. The other window draws the same cursor. The
cursor anchors to a semantic element, not to a screen position. Resize one window to a
different width. The cursor stays on the same element in both layouts. Each cursor position is a
normalized `(u, v)` offset per anchored element.

## Run the integration tests

The test in `socketio.test.ts` starts a real relay on an ephemeral port. It connects two Socket.IO
clients, sends a cursor update from one, and checks that the other client receives it through
`getRemoteSnapshot()`. Run them from the repository root:

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

The relay reads the room name from the client's handshake query (`?room=main`). Change
`roomFor` logic in `server.ts` if your app picks rooms a different way, for example from an
authenticated session.

## Binary payloads

Socket.IO delivers binary data as `ArrayBuffer` in browsers and as `Buffer` in Node.
`transport.ts` normalizes both to `Uint8Array` before it calls the presence client.

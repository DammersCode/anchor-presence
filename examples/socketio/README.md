# Socket.IO transport example

This relay is for demos and local development. Read the production notes before you run it anywhere else.

This example adds a Socket.IO transport to the demo. A peer is another client in the same room. The example has three parts:

- `transport.ts` wraps a Socket.IO client socket as a `PresenceTransport`.
- `server.ts` and `relay.ts` are a Socket.IO server. It relays `"presence"` events to the peers of the sender.
- `apps/demo` is the shared demo client. Open it with `?backend=socketio` to connect through this transport.

Only the backend changes. The client creates its presence client over `createSocketIoTransport` instead of a plain WebSocket. The UI uses the same `@dammers/anchor-presence-react` hooks, so the cursors behave the same way.

## Start the relay

Run `bun install` once in the repository root. Then start the relay:

```sh
cd examples/socketio
bun run dev:relay
```

The relay listens on <http://localhost:5001>. It needs no other setup.

## Start the client

Start the demo with the Socket.IO backend:

```sh
cd apps/demo
bun run dev -- --open "/?backend=socketio"
```

The client serves at <http://localhost:5173/>. Open that address in two browser windows, both with `?backend=socketio`.

Without `&room=`, each window joins its own random room. To share a room, add `&room=<name>` with the same name to both addresses. To change the cursor label, add `&name=<name>`.

## What the demo shows

Move the pointer in one window. The other window draws the same cursor on the same element, also at a different width. See the [root README](../../README.md) for the core idea.

## Run the integration tests

The test in `socketio.test.ts` starts a real relay on a free port. It connects two Socket.IO clients and sends a cursor update from one. It checks that the other client receives it through `getRemoteSnapshot()`. Run it from the repository root:

```sh
bunx vitest run --project socketio-example
```

## Use the transport in your app

Create the presence client over a Socket.IO socket:

```ts
import { createPresenceClient } from "@dammers/anchor-presence-core";
import { io } from "socket.io-client";
import { createSocketIoTransport } from "./transport";

const socket = io("https://your-server.example", { query: { room: "main" } });
const client = createPresenceClient({
  transport: createSocketIoTransport(socket),
});
```

## Close reasons

Socket.IO has no close codes. Before the relay disconnects a socket, it sends a `refused` event with a code and a reason. The transport reports the code through `subscribeClose`:

- `4001`: the room is full.
- `4002`: the server is full.
- `4004`: the origin is not in the allowlist. This code comes in the `connect_error` data.
- `4006`: the room token is missing or wrong. This code comes in the `connect_error` data, because the `io.use` middleware refuses the handshake.
- `4007`: the room name is not valid.

After any of these codes, the Socket.IO client does not reconnect, so `willReconnect` is `false`.

## Production notes

| Control                   | Status                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name check           | Yes. `parseRoom` accepts up to 256 characters of `[A-Za-z0-9_-]`. A missing name is `main`. The relay refuses an invalid name with code `4007`.                                                                |
| Max payload size          | Yes. The `maxHttpBufferSize` of Socket.IO closes the connection of a client that sends an oversized frame. `messageByteLength` drops a smaller message above `MAX_MESSAGE_BYTES` before the relay forwards it. |
| Rate limit per connection | Yes. A token bucket with `RATE_CAPACITY` and `RATE_REFILL_PER_SECOND`.                                                                                                                                         |
| Origin allowlist          | Yes. `RELAY_ALLOWED_ORIGINS` is a comma-separated list. An empty list (the default) accepts every origin (the Socket.IO CORS value `"*"`). The `io.use` middleware checks it on every transport.               |
| Auth hook                 | Yes. Pass an `authCheck` option, or set `RELAY_AUTH_TOKEN` for a shared room token. An `io.use` middleware runs the check before the connection completes. A refusal has code `4006`.                          |
| Identity binding          | Yes. If `authCheck` returns `{ clientId, user }`, the relay writes that identity into every JSON frame. `clientId` gets the suffix `~<connection>`. In this mode, the relay drops a frame that is not JSON.    |
| Room cleanup on close     | Yes. `disconnect` releases the slot of the socket in `ConnectionLimits`. Socket.IO removes the socket from the room.                                                                                           |
| Connection caps           | Yes. `RELAY_MAX_ROOM_SOCKETS` (default 64) limits one room. `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) limits the process. The relay refuses a socket above a cap with code `4001` or `4002`.                  |
| Dead connections          | Yes. The heartbeat of Socket.IO (`pingInterval`, `pingTimeout`).                                                                                                                                               |
| Slow receivers            | **No.** Socket.IO does not expose the buffered amount of a socket, as `ws` and the `ServerWebSocket` of Bun do. For this reason, the relay cannot skip or close a slow receiver.                               |

Before you expose the relay outside local development, set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN`. Put a TLS-terminating proxy in front of it.

## Room routing

The relay reads the room from the `room` query parameter of the handshake (`?room=main`). Your app can pick rooms in a different way, for example from an authenticated session. In that case, change the room lookup in `createSocketIoRelay` in `server.ts`.

## Binary payloads

Socket.IO delivers binary data as `ArrayBuffer` in browsers and as `Buffer` in Node. `transport.ts` converts both to `Uint8Array` before it calls the presence client.

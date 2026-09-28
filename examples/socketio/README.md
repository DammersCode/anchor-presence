# Socket.IO transport example

Demo only. Read the security notes below before you run this beyond local development.

This example adds a Socket.IO transport to the demo. It has three parts:

- `transport.ts`: wraps a Socket.IO client socket as a `LiveCursorTransport`.
- `server.ts` / `relay.ts`: a Socket.IO server. It relays `"presence"` events to the other sockets in a room.
- `apps/demo`: the shared demo client. Pass `?backend=socketio` to make it connect through this transport instead of a plain WebSocket.

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
cd apps/demo
bun run dev -- --open "/?backend=socketio"
```

The client serves at <http://localhost:5173/>. Open that address in two browser windows, both with `?backend=socketio`.

If you want multiple room lanes, add `&room=<name>` to both addresses. The default room is `main`. Add `&name=<name>` to change the cursor label.

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

## Production notes (security baseline)

| Control                                 | Status                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name validation (length + charset) | Yes — `sanitizeRoomName` caps at 256 chars and restricts to `[A-Za-z0-9_-]`, falling back to `"main"`.                                                            |
| Max payload size                        | Yes — Socket.IO's `maxHttpBufferSize` rejects an oversized frame at the engine level. `messageByteLength` also gates the size check applied before fan-out.       |
| Per-connection rate limit               | Yes — token bucket, `RATE_CAPACITY` / `RATE_REFILL_PER_SECOND`.                                                                                                   |
| Origin allowlist                        | Yes — `RELAY_ALLOWED_ORIGINS`, comma-separated. Empty (default) allows every origin (Socket.IO's CORS `"*"`), for local dev.                                      |
| Auth hook placeholder                   | Yes — `authCheck` option, or `RELAY_AUTH_TOKEN` env var for a plain shared-token check, enforced in an `io.use` middleware before the connection completes.       |
| Room cleanup on close                   | Yes — `disconnect` releases the socket's slot in `ConnectionLimits`. Socket.IO leaves the room automatically.                                                     |
| Per-room / total connection caps        | Yes — `RELAY_MAX_ROOM_SOCKETS` (default 128) caps one room, `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) caps the process. A rejected socket is disconnected.       |
| Dead-connection detection               | Yes — Socket.IO's own heartbeat (`pingInterval`, `pingTimeout`).                                                                                                  |
| Backpressure on slow consumers          | **No.** Socket.IO does not expose a per-socket buffered-amount the way raw `ws` or Bun's `ServerWebSocket` do, so this example applies no slow-peer backpressure. |

Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

## Room routing

The relay reads the room name from the handshake query of the client (`?room=main`). If your app picks rooms a different way, for example from an authenticated session, change the room lookup in `createSocketIoRelay` in `server.ts`.

## Binary payloads

Socket.IO delivers binary data as `ArrayBuffer` in browsers and as `Buffer` in Node. `transport.ts` normalizes both to `Uint8Array` before it calls the presence client.

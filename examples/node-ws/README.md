# Node `ws` relay

This relay is for demos and local development. Read the production notes before you run it anywhere else.

This example is a room-broadcast relay on the [`ws`](https://github.com/websockets/ws) package over `node:http`. A peer is another client in the same room. The relay forwards each message to the peers of the sender. The client needs no custom transport. It uses `createWebSocketTransport` from `@anchor-presence/dom`, as for `apps/server`.

- `server.ts` exports `createNodeWsRelay(port)`. It returns a promise of `{ url, close }`.
- `relay.ts` is the entry file (`bun run dev:relay`).

## Run it

Start the relay from this folder:

```sh
cd examples/node-ws
bun run dev:relay
```

The relay listens on <http://localhost:8789>. To use another port, give the port as the first argument. To connect `apps/demo`, open it with `?backend=node-ws`.

## Run the integration test

Run the test from the repository root:

```sh
bunx vitest run --project node-ws-example
```

The test starts a real relay on a free port and connects two `createPresenceClient` instances over a real WebSocket. It checks the relay in one room, the isolation between rooms, the cleanup on disconnect, and the drop of an oversized frame.

## Production notes

| Control                   | Status                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name check           | Yes. `parseRoom` accepts up to 256 characters of `[A-Za-z0-9_-]`. A missing name is `main`. An invalid name closes the socket with code `4007`.                                                             |
| Max payload size          | Yes. The message handler drops a message above `MAX_MESSAGE_BYTES` (default 32 KiB) and keeps the socket open. Above the `maxPayload` limit of `ws` (four times that size, at least 1 MiB), `ws` closes it. |
| Rate limit per connection | Yes. A token bucket with `RATE_CAPACITY` and `RATE_REFILL_PER_SECOND`.                                                                                                                                      |
| Origin allowlist          | Yes. `RELAY_ALLOWED_ORIGINS` is a comma-separated list. An empty list (the default) accepts every origin. The relay accepts the upgrade of a foreign origin and closes it with code `4004`.                 |
| Auth hook                 | Yes. Pass an `authCheck` option, or set `RELAY_AUTH_TOKEN` for a shared room token. A refused connection closes with code `4006`.                                                                           |
| Identity binding          | Yes. If `authCheck` returns `{ clientId, user }`, the relay writes that identity into every JSON frame. `clientId` gets the suffix `~<connection>`. In this mode, the relay drops a frame that is not JSON. |
| Room cleanup on close     | Yes. The `close` handler removes the socket from the `Set<WebSocket>` of its room, and the relay deletes an empty room.                                                                                     |
| Connection caps           | Yes. `RELAY_MAX_ROOM_SOCKETS` (default 64) limits one room. `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) limits the process. A refused socket closes with code `4001` or `4002`.                              |
| Dead connections          | Yes. The relay pings every socket at half of `RELAY_IDLE_TIMEOUT_SECONDS` (default 60). It terminates a socket that did not answer the previous ping.                                                       |
| Slow receivers            | Yes. The relay skips sends above `RELAY_SLOW_PEER_SOFT_BYTES` and closes the socket with code `4003` above `RELAY_SLOW_PEER_HARD_BYTES`. It sends again below `RELAY_SLOW_PEER_RESUME_BYTES`.               |

Before you expose the relay outside local development, set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN`. Put a TLS-terminating proxy in front of it.

## Room routing

The relay reads the room from the `room` query parameter (`/?room=main`). A missing name is `main`. An invalid name closes the socket with code `4007`. The relay accepts the upgrade only at `/` and answers any other path with HTTP `404`.

## Use the transport in your app

Create the presence client with the WebSocket transport. The client connects the transport:

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ port: 8789, path: "/?room=main" });
const client = createPresenceClient({ transport });
```

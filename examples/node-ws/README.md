# Node `ws` relay

Demo only. Read the security notes below before you run this beyond local development.

This example is a room-broadcast relay built on the [`ws`](https://github.com/websockets/ws) package over `node:http`. The client side needs no custom transport: it uses `createWebSocketTransport` from `@anchor-presence/dom`, the same as `apps/server`.

- `server.ts`: exports `createNodeWsRelay(port)`, returning a promise of `{ url, close }`.
- `relay.ts`: a runnable entry point (`bun run dev:relay`).

## Run it

```sh
cd examples/node-ws
bun run dev:relay
```

The relay listens on <http://localhost:8789> by default. Point `apps/demo` at it with `?backend=node-ws`, or pass a port as the first CLI argument.

## Run the integration test

```sh
bunx vitest run --project node-ws-example
```

It starts a real relay on an ephemeral port, connects two `createPresenceClient` instances over a real WebSocket, and checks: same-room relay, cross-room isolation, disconnect cleanup, and an oversized frame getting dropped without crashing the relay.

## Production notes (security baseline)

| Control                                 | Status                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Room name validation (length + charset) | Yes — `sanitizeRoomName` caps at 256 chars and restricts to `[A-Za-z0-9_-]`, falling back to `"main"`.                                                                                                                   |
| Max payload size                        | Yes — `WebSocketServer`'s `maxPayload` rejects an oversized frame during parsing, closing that connection instead of crashing the relay. `MAX_MESSAGE_BYTES` also gates the size check applied before fan-out.           |
| Per-connection rate limit               | Yes — token bucket, `RATE_CAPACITY` / `RATE_REFILL_PER_SECOND`.                                                                                                                                                          |
| Origin allowlist                        | Yes — `RELAY_ALLOWED_ORIGINS`, comma-separated. Empty (default) allows every origin, for local dev. Rejected upgrades get the raw socket destroyed before the WebSocket handshake completes.                             |
| Auth hook placeholder                   | Yes — `authCheck` option, or `RELAY_AUTH_TOKEN` env var for a plain shared-token check. Wire it to `verify(token)` for real auth.                                                                                        |
| Room cleanup on close                   | Yes — the room's `Set<WebSocket>` drops the socket in the `close` handler and the room entry is deleted once empty.                                                                                                      |
| Per-room / total connection caps        | Yes — `RELAY_MAX_ROOM_SOCKETS` (default 128) caps one room, `RELAY_MAX_SOCKETS` (default 10,000) caps the process. A rejected upgrade gets its raw socket destroyed.                                                     |
| Dead-connection detection               | Yes — the relay pings every socket at half of `RELAY_IDLE_TIMEOUT_SECONDS` (default 60) and terminates a socket that did not answer the previous ping.                                                                   |
| Backpressure on slow consumers          | Yes — `ws` exposes `bufferedAmount` per socket. The relay skips sends above a soft watermark and closes above a hard one (`RELAY_SLOW_PEER_SOFT_BYTES` / `RELAY_SLOW_PEER_HARD_BYTES` / `RELAY_SLOW_PEER_RESUME_BYTES`). |

Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

## Room routing

The relay reads the room name from the `room` query parameter (`?room=main`). An invalid or missing name falls back to `"main"`.

## Use the transport in your app

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ port: 8789, path: "/?room=main" });
const client = createPresenceClient({ transport });
transport.connect();
```

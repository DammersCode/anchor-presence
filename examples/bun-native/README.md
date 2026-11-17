# Bun-native WebSocket relay

Demo only. Read the security notes below before you run this beyond local development.

This example is a room-broadcast relay built directly on `Bun.serve`'s WebSocket support, using Bun's topic pub-sub instead of a hand-rolled room map. The client side needs no custom transport: it uses `createWebSocketTransport` from `@anchor-presence/dom`, the same as `apps/server`.

- `server.ts`: exports `createBunRelay(port)`, returning `{ url, close }`.
- `relay.ts`: a runnable entry point (`bun run dev:relay`).

## Run it

```sh
cd examples/bun-native
bun run dev:relay
```

The relay listens on <http://localhost:8788> by default. Point `apps/demo` at it with `?backend=bun-native`, or pass a port as the first CLI argument.

## Run the integration test

```sh
bunx vitest run --project bun-native-example
```

It starts a real relay on an ephemeral port, connects two `createPresenceClient` instances over a real WebSocket, and checks: same-room relay, cross-room isolation, disconnect cleanup, and an oversized frame getting dropped without crashing the relay.

## Production notes (security baseline)

| Control                                 | Status                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name validation (length + charset) | Yes — `sanitizeRoomName` caps at 256 chars and restricts to `[A-Za-z0-9_-]`, falling back to `"main"`.                                                                                                                                                  |
| Max payload size                        | Yes — `MAX_MESSAGE_BYTES` (default 32 KiB). Oversized messages are dropped, not closed.                                                                                                                                                                 |
| Per-connection rate limit               | Yes — token bucket, `RATE_CAPACITY` / `RATE_REFILL_PER_SECOND`.                                                                                                                                                                                         |
| Origin allowlist                        | Yes — `RELAY_ALLOWED_ORIGINS`, comma-separated. Empty (default) allows every origin, for local dev.                                                                                                                                                     |
| Auth hook placeholder                   | Yes — `authCheck` option, or `RELAY_AUTH_TOKEN` env var for a plain shared-token check. Wire it to `verify(token)` for real auth.                                                                                                                       |
| Room cleanup on close                   | Yes — the `close` handler releases the socket's slot in `ConnectionLimits`. Bun's pub-sub drops the subscription automatically.                                                                                                                         |
| Per-room / total connection caps        | Yes — `RELAY_MAX_ROOM_SOCKETS` (default 128) caps one room, `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) caps the process. Rejected sockets close with `4001` or `4002`.                                                                                  |
| Dead-connection detection               | Yes — Bun's `idleTimeout` (`RELAY_IDLE_TIMEOUT_SECONDS`, default 60) with `sendPings`. Bun pings a silent socket and closes it when no pong arrives.                                                                                                    |
| Backpressure on slow consumers          | Close only — Bun's `backpressureLimit` (`RELAY_SLOW_PEER_HARD_BYTES`, default 8 MiB) with `closeOnBackpressureLimit`. Bun's pub-sub does not expose each receiver's buffer, so the relay cannot skip a slow receiver first, as `examples/node-ws` does. |

Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

## Room routing

The relay reads the room name from the `room` query parameter (`?room=main`). A missing name is `"main"`. An invalid name closes the socket with code `4007`.

## Use the transport in your app

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ port: 8788, path: "/?room=main" });
const client = createPresenceClient({ transport });
transport.connect();
```

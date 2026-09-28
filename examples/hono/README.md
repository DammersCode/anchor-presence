# Hono WebSocket relay

Demo only. Read the security notes below before you run this beyond local development.

This example is a room-broadcast relay built on [Hono](https://hono.dev), using `hono/bun`'s built-in `upgradeWebSocket` helper. The client side needs no custom transport: it uses `createWebSocketTransport` from `@anchor-presence/dom`, the same as `apps/server`.

- `server.ts`: exports `createHonoRelay(port)`, returning `{ url, close }`.
- `relay.ts`: a runnable entry point (`bun run dev:relay`).

## Why `hono/bun`, not `@hono/node-ws`

This repo runs every server on Bun already (`bun run`, `bun.lock`). `hono/bun`'s `upgradeWebSocket` and `websocket` handler wire straight into `Bun.serve`, with no extra WebSocket dependency. `@hono/node-ws` exists for the same helper on plain `node:http`. Use it instead if you deploy Hono outside Bun.

## Run it

```sh
cd examples/hono
bun run dev:relay
```

The relay listens on <http://localhost:8790> by default. Point `apps/demo` at it with `?backend=hono`, or pass a port as the first CLI argument.

## Run the integration test

```sh
bunx vitest run --project hono-example
```

It starts a real relay on an ephemeral port, connects two `createPresenceClient` instances over a real WebSocket, and checks: same-room relay, cross-room isolation, disconnect cleanup, and an oversized frame getting dropped without crashing the relay.

## Production notes (security baseline)

| Control                                 | Status                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name validation (length + charset) | Yes — `sanitizeRoomName` caps at 256 chars and restricts to `[A-Za-z0-9_-]`, falling back to `"main"`.                                                                 |
| Max payload size                        | Yes — `MAX_MESSAGE_BYTES` (default 32 KiB). Oversized messages are dropped, not closed.                                                                                |
| Per-connection rate limit               | Yes — token bucket, `RATE_CAPACITY` / `RATE_REFILL_PER_SECOND`.                                                                                                        |
| Origin allowlist                        | Yes — `RELAY_ALLOWED_ORIGINS`, comma-separated. Empty (default) allows every origin, for local dev.                                                                    |
| Auth hook placeholder                   | Yes — `authCheck` option, or `RELAY_AUTH_TOKEN` env var for a plain shared-token check. Wire it to `verify(token)` for real auth.                                      |
| Room cleanup on close                   | Yes — `onClose` removes the socket's room entry and deletes the room once empty.                                                                                       |
| Per-room / total connection caps        | Yes — `RELAY_MAX_ROOM_SOCKETS` (default 128) caps one room, `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) caps the process. Rejected sockets close with `4001` or `4002`. |
| Dead-connection detection               | Yes — Bun's `idleTimeout` (`RELAY_IDLE_TIMEOUT_SECONDS`, default 60) with `sendPings`. Bun pings a silent socket and closes it when no pong arrives.                   |
| Backpressure on slow consumers          | Yes — `WSContext.raw` exposes the underlying Bun socket's `getBufferedAmount()`. The relay skips sends above a soft watermark and closes above a hard one.             |

Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

## A hono/bun gotcha

Every hono WebSocket event (`onOpen`, `onMessage`, `onClose`) receives a **new** `WSContext` wrapper around the same underlying Bun socket. Do not use the `WSContext` object itself as a map key or in a `Set` membership check — it will never match across events. Key your room state on `ws.raw` (the stable Bun socket) instead, as `server.ts` does.

## Room routing

The relay reads the room name from the `room` query parameter (`?room=main`). An invalid or missing name falls back to `"main"`.

## Use the transport in your app

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ port: 8790, path: "/?room=main" });
const client = createPresenceClient({ transport });
transport.connect();
```

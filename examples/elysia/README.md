# Elysia WebSocket relay

Demo only. Read the security notes below before you run this beyond local development.

This example is a room-broadcast relay built on [Elysia](https://elysiajs.com)'s `.ws()` route, running on Bun. It uses Elysia/Bun's topic pub-sub (`ws.subscribe`, `ws.publish`) the same way `examples/bun-native` does. The relay types its query with a schema, and the client connects through an Eden treaty, so a wrong query parameter is a compile error on the client.

- `server.ts`: exports `createElysiaRelay(port)`, returning `{ url, app, close }`, and the `ElysiaRelayApp` type the client's Eden treaty uses.
- `relay.ts`: a runnable entry point (`bun run dev:relay`).
- `client.ts`: the typed client. Eden builds the socket, and `createWebSocketTransport` from `@anchor-presence/dom` owns its lifecycle through the `WebSocketCtor` option.

## Run it

```sh
cd examples/elysia
bun run dev:relay
```

The relay listens on <http://localhost:8791> by default. Point `apps/demo` at it with `?backend=elysia`, or pass a port as the first CLI argument.

## Run the integration test

```sh
bunx vitest run --project elysia-example
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
| Room cleanup on close                   | Yes — `close` releases the socket's slot in `ConnectionLimits`. Elysia/Bun's pub-sub drops the subscription automatically.                                                                                                                              |
| Per-room / total connection caps        | Yes — `RELAY_MAX_ROOM_SOCKETS` (default 128) caps one room, `RELAY_MAX_TOTAL_SOCKETS` (default 10,000) caps the process. Rejected sockets close with `4001` or `4002`.                                                                                  |
| Dead-connection detection               | Yes — Bun's `idleTimeout` (`RELAY_IDLE_TIMEOUT_SECONDS`, default 60) with `sendPings`. Bun pings a silent socket and closes it when no pong arrives.                                                                                                    |
| Backpressure on slow consumers          | Close only — Bun's `backpressureLimit` (`RELAY_SLOW_PEER_HARD_BYTES`, default 8 MiB) with `closeOnBackpressureLimit`. Bun's pub-sub does not expose each receiver's buffer, so the relay cannot skip a slow receiver first, as `examples/node-ws` does. |

Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

## Room routing

The relay reads the room name from the `room` query parameter (`?room=main`). An invalid or missing name falls back to `"main"`.

## Use the transport in your app

See `client.ts`. Eden builds the socket with a typed `room` query parameter, and the transport takes it through the `WebSocketCtor` option:

```ts
const relay = treaty<ElysiaRelayApp>("http://localhost:8791");

function edenSocket() {
  return relay.subscribe({ query: { room: "main" } });
}

const transport = createWebSocketTransport({
  WebSocketCtor: edenSocket as unknown as WebSocketCtor,
});
const client = createPresenceClient({ transport });
transport.connect();
```

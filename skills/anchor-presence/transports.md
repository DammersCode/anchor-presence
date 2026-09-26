# Choosing a transport and relay

A **relay** forwards each presence message to the other clients in the same room and never reads it. The client needs one transport that sends and receives bytes over that relay.

## Pick one row

Use the first row that matches the survey. Each docs page has the full server and client code; fetch it as markdown.

| The project has                        | Transport on the client                                | Relay                                | Docs page (append `.md`)             |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------ |
| A Socket.IO server                     | Socket.IO transport from the example                   | Add a presence event to that server  | `/docs/examples/backends/socketio`   |
| An ASP.NET Core app                    | SignalR transport from the example                     | Add the presence hub to that app     | `/docs/examples/backends/signalr`    |
| A Hono app                             | `createWebSocketTransport` from `@anchor-presence/dom` | Hono `upgradeWebSocket` route        | `/docs/examples/backends/hono`       |
| An Elysia app                          | `createWebSocketTransport`                             | Elysia `.ws()` route                 | `/docs/examples/backends/elysia`     |
| A Node server (Express, Fastify, http) | `createWebSocketTransport`                             | `ws` package on the same HTTP server | `/docs/examples/backends/node-ws`    |
| Bun, or no server yet                  | `createWebSocketTransport`                             | `Bun.serve` WebSocket relay          | `/docs/examples/backends/bun-native` |
| Tests or a local prototype             | `createInMemoryPair` from `@anchor-presence/core`      | none                                 | `/docs/core/in-memory-transport`     |
| Two tabs on one origin, no server      | A `BroadcastChannel` transport                         | none                                 | `/docs/core/custom-transport`        |

Base URL: `https://anchor-presence.vercel.app`. Every page also links the shared relay guard helpers (`/docs/examples/backends`).

A managed service (Supabase Realtime, Ably, Pusher, Liveblocks) works through a custom transport over its pub/sub channel: implement the interface below and use one channel per room. See `/docs/core/custom-transport`.

## The transport interface

`LiveCursorTransport` from `@anchor-presence/core`. Read its `.d.ts` for the full contract:

- `send(data: Uint8Array)` and `subscribe(listener)` are required.
- `connect`, `disconnect`, `subscribeStatus`, `getStatus`, and `bufferedBytes` are optional. Implement `subscribeStatus` and `getStatus` so the UI can show the connection state.

Pass `autoConnect: true` to `createPresenceClient` in the `usePresenceClient` factory, or call `transport.connect()` there yourself. `client.dispose()` calls `transport.disconnect()`.

## Rooms

The room is the relay's grouping key, usually a query parameter on the connection URL. Derive it from the shared resource (document ID, board ID), never from the user. Two users see each other only when their room keys match.

## Relay baseline

A relay you write or copy must:

1. Drop messages larger than 32 KiB before it forwards them.
2. Rate-limit each connection.
3. Cap connections per room and per process.
4. Skip or close slow receivers when their send buffer passes a limit.
5. Check the `Origin` header against an allowlist in production.
6. Check room access with the app's auth (token or session) when rooms are private.
7. Close dead connections with ping and pong.
8. Forward only to the sender's room, never to the sender itself.
9. Accept room names of limited length and charset `[A-Za-z0-9_-]`.

The example relays implement these through `relay-guard.ts`. Keep it when you copy a relay.

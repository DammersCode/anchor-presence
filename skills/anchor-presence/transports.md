# Choosing a transport and relay

A **relay** forwards each presence message to the other clients in the same room and never reads it. The client needs one transport that sends and receives bytes over that relay.

## Pick one row

Use the first row that matches the survey. Each docs page has the full server and client code. Fetch it as markdown.

| The project has                          | Transport on the client                                                                    | Relay                                | Docs page (append `.md`)                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| A Socket.IO server                       | Socket.IO transport from the example                                                       | Add a presence event to that server  | `/docs/examples/backends/socketio`      |
| An ASP.NET Core app                      | SignalR transport from the example                                                         | Add the presence hub to that app     | `/docs/examples/backends/signalr`       |
| A Hono app                               | `createWebSocketTransport` from `@anchor-presence/dom`                                     | Hono `upgradeWebSocket` route        | `/docs/examples/backends/hono`          |
| An Elysia app                            | `createWebSocketTransport`                                                                 | Elysia `.ws()` route                 | `/docs/examples/backends/elysia`        |
| A Node server (Express, Fastify, http)   | `createWebSocketTransport`                                                                 | `ws` package on the same HTTP server | `/docs/examples/backends/node-ws`       |
| Bun, or no server yet                    | `createWebSocketTransport`                                                                 | `Bun.serve` WebSocket relay          | `/docs/examples/backends/bun-native`    |
| Tests or a local prototype               | `createInMemoryPair`, or `createInMemoryRoom` for many peers, from `@anchor-presence/core` | none                                 | `/docs/core/in-memory-transport`        |
| Windows or tabs of one origin, no server | `createBroadcastChannelTransport` from `@anchor-presence/dom`                              | none                                 | `/docs/dom/broadcast-channel-transport` |

Base URL: `https://anchor-presence.vercel.app`. Every page also links the shared relay guard helpers (`/docs/examples/backends`).

A managed service (Supabase Realtime, Ably, Pusher, Liveblocks) works through a custom transport over its pub/sub channel: implement the interface below and use one channel per room. See `/docs/core/custom-transport`.

## The transport interface

`PresenceTransport` from `@anchor-presence/core`. Read its `.d.ts` for the full contract:

- `send(data: Uint8Array)` and `subscribe(listener)` are required.
- `connect`, `disconnect`, `subscribeStatus`, `subscribeClose`, `getStatus`, and `bufferedBytes` are optional. Implement `subscribeStatus` and `getStatus` so the UI can show the connection state. `subscribeClose` reports each close with its code, reason, and `willReconnect`.

The client created in the provider's `factory` connects the transport by default. If you need to connect the transport yourself, pass `autoConnect: false` and call `transport.connect()` in the factory. `client.dispose()` calls `transport.disconnect()`.

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

The Bun, `ws`, Hono, and Elysia examples cover this list. `RELAY_MAX_ROOM_SOCKETS` and `RELAY_MAX_TOTAL_SOCKETS` set their caps. `RELAY_IDLE_TIMEOUT_SECONDS` sets when a dead connection closes. The Socket.IO and SignalR examples rely on their library for part of this list. Read their docs page.

## Adding presence to an existing server

When the project already runs Socket.IO, SignalR, or a WebSocket server, add one presence event, hub method, or route to it. Do not start a second server. Apply the baseline inside that handler. The shared guard helpers give the size cap, the rate limit, and the room name check. The origin and auth checks usually exist on the server already. Copy only the helpers the handler uses.

## Copying an example relay

- The server file imports `../_shared/relay-guard`. Copy the helpers from the "Shared guard helpers" section of `/docs/examples/backends` into `relay-guard.ts` next to the server file, and change the import to `./relay-guard`.
- The server file exports a factory, for example `createBunRelay(port)`, and does not listen on its own. Add an entry file that calls the factory once and logs the URL. Start that file from a `package.json` script.
- `createWebSocketTransport` takes either `url` or `port` and `path`. Use `url`, a full `ws://` or `wss://` URL, for a relay on another host. Use `port` and `path` for a relay on the page's own host name. Use the form the chosen docs page shows.

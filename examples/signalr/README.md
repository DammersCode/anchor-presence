# SignalR transport example

This hub is for demos and local development. Read the production notes before you run it anywhere else.

This example adds a SignalR transport to the demo. A peer is another client in the same room. The example has three parts:

- `transport.ts` wraps a plain `@microsoft/signalr` `HubConnection` as a `LiveCursorTransport`.
- `apps/demo` is the shared demo client. Open it with `?backend=signalr` to connect through this transport.
- `server/` is a .NET 10 app with one SignalR hub. The hub relays presence messages to the peers of the sender.

Only the backend changes. The client creates its presence client over `createSignalRTransport` instead of a plain WebSocket. The UI uses the same `@anchor-presence/react` hooks.

`createSignalRTransport` takes a `HubConnection` that you build with the `HubConnectionBuilder` of `@microsoft/signalr`. It adds the wire handlers and maps `HubConnectionState` to the `ConnectionStatus` of core. Its `connect()` calls `connection.start()`, and its `disconnect()` calls `connection.stop()`.

If your app uses [`use-signalr`](https://www.npmjs.com/package/@dammers/use-signalr-react) for its other hubs, read the "Already using use-signalr?" section of the SignalR docs page. It creates the transport on the connection of that provider.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). The server targets `net10.0`.
- [Bun](https://bun.sh). The client uses `bun run dev`.
- On a fresh checkout, run `bun install` once in the repository root. It links the workspace packages and the dependencies of this example.

## Start the server

Start the hub from the server folder:

```sh
cd examples/signalr/server
dotnet run
```

The server listens on <http://localhost:5000>. It needs no other setup.

## Start the client

Start the demo with the SignalR backend:

```sh
cd apps/demo
bun run dev -- --open "/?backend=signalr"
```

The client serves at <http://localhost:5173/>. Open that address in two browser windows, both with `?backend=signalr`.

Without `&room=`, each window joins its own random room. To share a room, add `&room=<name>` with the same name to both addresses. To change the cursor label, add `&name=<name>`.

## What the demo shows

Move the pointer in one window. The other window draws the same cursor on the same element, also at a different width. See the [root README](../../README.md) for the core idea.

## How the hub works

The hub groups connections by room and relays in the group. See `server/Hub/PresenceHub.cs` for the full code.

- A client connects with a `room` query parameter on the hub URL (`/hubs/presence?room=main`). A missing parameter is the room `main`.
- `OnConnectedAsync` checks the room name against `^[A-Za-z0-9_-]{1,256}$` and adds the connection to the group of that room.
- If the room name is not valid, the hub sends a `Refused` message with the code `4007` and the reason `invalid room`. Then it aborts the connection. It never merges an invalid name into `main`.
- A client sends an update with the `OnPresence` hub method. The argument is the presence message as a base64 string, so any codec works.
- The hub sends the same string as a `PresenceReceived` event to every other connection in the same room.

## Close reasons

The transport reports the `4007` code of a `Refused` message through `subscribeClose`. `willReconnect` is `true` while `withAutomaticReconnect` retries, and `false` after the connection closes. The hub sends no other code. An origin outside the allowlist gets an HTTP `403`, with no code.

## Validation in the receiver

The hub checks only the size of a message. The receiving client checks the rest. `@anchor-presence/core` checks every incoming message against the presence schema before it stores it.

## Cursor removal

When a window closes, the binding sends a `leave` message on `pagehide`. The other windows remove its cursor at once. The `leave` message can fail to arrive, for example after a crash. Then `@anchor-presence/core` marks that client stale after `staleTimeoutMs` (default `70000` ms) and removes its cursor.

## Transport tests

The tests in `signalr.test.ts` use a fake `HubConnection`, with no real server. Run them from the repository root:

```sh
bunx vitest run --project signalr-example
```

They cover data delivery, the drop of a send while the hub is not connected, the status mapping and the close reasons.

`signalr-hub.test.ts`, in the same project, builds the real hub and runs the compiled DLL. It checks the relay in one room, the isolation between rooms, and the drop of an oversized frame. If `dotnet` is not on `PATH`, the test skips. As a result, `bun run test` passes on a machine without the .NET SDK.

The `main.yml` workflow installs .NET, so the hub test runs on every push to `main`.

## Production notes

| Control                   | Status                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name check           | Yes. `RoomFor` in `Hub/PresenceHub.cs` accepts `^[A-Za-z0-9_-]{1,256}$`. A missing room is `main`. An invalid name gets `Refused` with code `4007`, and the hub aborts the connection.                    |
| Max payload size          | Yes. `MaximumReceiveMessageSize = 32 * 1024` in `Program.cs`. The cap applies to the base64 text, so the real payload cap is about 24 KiB. SignalR closes the connection on a larger message.             |
| Rate limit per connection | **No.** ASP.NET Core has no rate limiter per hub method. Add `Microsoft.AspNetCore.RateLimiting` for one.                                                                                                 |
| Origin allowlist          | Yes. `Program.cs` reads `RELAY_ALLOWED_ORIGINS`, a comma-separated list. A middleware refuses a request with a foreign `Origin` header, also a WebSocket upgrade. The default is `http://localhost:5173`. |
| Auth hook                 | **No.** The hub has no auth check. For real auth, add an `[Authorize]` attribute and an auth scheme to `PresenceHub`.                                                                                     |
| Identity binding          | **No.** The hub binds no identity, so a client can claim any `clientId`.                                                                                                                                  |
| Room cleanup on close     | Yes. SignalR removes a closed connection from its groups.                                                                                                                                                 |
| Connection caps           | **No.** For a cap, add `Microsoft.AspNetCore.RateLimiting` or a custom `IHubFilter`.                                                                                                                      |
| Slow receivers            | Partial. SignalR buffers each connection and applies its own backpressure. This example sets no custom limit.                                                                                             |

Before you expose the hub outside local development, set `RELAY_ALLOWED_ORIGINS` and add auth and a rate limit. Put a TLS-terminating proxy in front of it.

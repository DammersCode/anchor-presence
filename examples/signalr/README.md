# SignalR transport example

Demo only. `PresenceHub` broadcasts every message to all connections; it has no rooms and no size or rate limit. Do not run it as-is in production.

This example adds a SignalR transport to the demo. It has three parts:

- `client/src/transport.ts`: wraps a use-signalr hub connection as a `LiveCursorTransport`.
- `client/`: the same demo page as `apps/demo`.
- `server/`: a minimal .NET 10 app. It runs one SignalR hub that relays presence messages.

Only the backend changes. The client builds its presence client over `createSignalRTransport` instead of a plain WebSocket. The UI still uses the same `@anchor-presence/react` hooks.

The React client layer is [`use-signalr`](https://github.com/DammersCode/use-signalr) (`@dammers/use-signalr-react`). It owns the hub connection, the typed events, reconnection, and status. This transport only adapts that connection to the presence client.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). The server targets `net10.0`.
- [Bun](https://bun.sh). The client uses `bun run dev`.
- On a fresh checkout, run `bun install` once in the repository root. It links the workspace packages and the dependencies of this example.

## Start the server

```sh
cd examples/signalr/server
dotnet run
```

The server listens on <http://localhost:5000>. It needs no further setup.

## Start the client

```sh
cd examples/signalr/client
bun run dev
```

The client serves at <http://localhost:5173/>. Open that address in two browser windows.

Add `?name=<name>` to change the cursor label.

## What the demo shows

Move the pointer in one window and the other window draws the same cursor on the same element, even at a different width. See the [root README](../../README.md) for the core idea.

## How the relay works

The hub is a dumb relay. It forwards every payload to every other connection. It keeps no state and never parses the payload.

```csharp
public class PresenceHub : Hub
{
    public void OnPresence(string payload)
    {
        Clients.Others.SendAsync("PresenceReceived", payload);
    }
}
```

- A client sends an update by invoking the `OnPresence` hub method. It passes the JSON presence message as a string.
- The hub sends the same string as a `PresenceReceived` event to all other connections.
- If you want a client to receive its own messages, use `Clients.All`.

## Receiver-side validation

The relay does not validate payloads. The receiving client does. Core validates every incoming message against the presence schema before it stores it.

## Stale cursor removal

When a window closes, the server drops the connection. The other clients stop receiving its updates. Core marks that client stale after `staleTimeoutMs` and removes its cursor. The default is `70000ms`.

To check this quickly, add `?stale-ms=12000&heartbeat-ms=2000` to the URL, then close one window. The other window removes its cursor within about 15 seconds.

## Transport adapter tests

The tests in `signalr.test.ts` mock the hub connection. They do not use a real server. Run them from the repository root:

```sh
bunx vitest run --project signalr-example
```

They cover data delivery, dropping a send while the hub is not connected, status mappings, and the event-handler attach and detach path.

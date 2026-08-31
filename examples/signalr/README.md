# SignalR transport example

This example shows a `LiveCursorTransport` for ASP.NET Core SignalR. It has three parts:

- `client/src/transport.ts`: `createSignalRTransport(harness)`. It wraps a use-signalr hub connection.
- `client/`: a Vite + React app. It renders live cursors on the same demo page as `apps/demo`,
  anchored to semantic elements.
- `server/`: a minimal .NET 10 app. It runs one SignalR hub that relays presence messages.

The `client/` page is the same demo page as `apps/demo`. Only the backend is different: the app
calls `getPresenceClient()`, which builds the presence client over `createSignalRTransport`
instead of a plain WebSocket. The rest of the UI calls the same `@anchor-presence/react` hooks,
so the live cursor behavior is unchanged.

The React client layer is [`use-signalr`](https://github.com/DammersCode/use-signalr)
(`@dammers/use-signalr-react`). It owns the hub connection, the typed events and methods,
reconnects, and the per-hub status. This transport only adapts that connection to the presence
client.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). The server targets `net10.0`.
- [Bun](https://bun.sh). The client uses `bun run dev`.
- On a fresh checkout, run `bun install` once in the repository root first. It links the workspace
  packages and the example's dependencies.

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

Move the pointer inside the page in one window. The other window draws the same cursor. The
cursor anchors to a semantic element, not to a screen position. Resize one window to a
different width. The cursor stays on the same element in both layouts. Each cursor position is a
normalized `(u, v)` offset per anchored element.

Each element registers an anchor id through `useCursorAnchor`. A pointer movement inside an
element captures the normalized offsets of every anchor in its chain. The receiver reads its own
element size and multiplies the offsets by that size. That resolves the cursor onto the receiver's
layout.

## How the relay works

The hub is a dumb relay. It forwards every received payload to every other connection. It keeps
no state and never parses the payload.

```csharp
public class PresenceHub : Hub
{
    public void OnPresence(string payload)
    {
        Clients.Others.SendAsync("PresenceReceived", payload);
    }
}
```

- A client sends an update by invoking the `OnPresence` hub method. It passes the JSON presence
  message as a string.
- The hub sends the same string as a `PresenceReceived` event to all other connections.
- Use `Clients.All` if you want a client to receive its own messages as well.

## Receiver-side validation

The relay does not validate payloads. The receiving client does. The core validates every incoming
message against the presence schema before it stores it. That is the receiver-authoritative rule in
`SPECIFICATION.md`.

## Stale cursor removal

When a window closes, the server drops the connection. The remaining clients stop receiving its
updates. The core marks that client stale after `staleTimeoutMs` and removes its cursor. The default
is 70000ms.

You can shorten the timeout for a quick check. Add `?stale-ms=12000&heartbeat-ms=2000` to the URL,
then close one window. The other window removes its cursor within about 15 seconds.

## Transport adapter tests

The tests in `signalr.test.ts` mock the hub connection. They do not use a real server. Run them from
the repository root:

```sh
bunx vitest run --project signalr-example
```

The tests cover delivery to data subscribers, dropping a send while the hub is not connected,
status mappings, and the event-handler attach and detach path.

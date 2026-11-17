# SignalR transport example

Demo only. Read the security notes below before you run this beyond local development.

This example adds a SignalR transport to the demo. It has three parts:

- `transport.ts`: wraps a plain `@microsoft/signalr` `HubConnection` as a `LiveCursorTransport`.
- `apps/demo`: the shared demo client. Pass `?backend=signalr` to make it connect through this transport instead of a plain WebSocket.
- `server/`: a minimal .NET 10 app. It runs one SignalR hub that relays presence messages per room.

Only the backend changes. The client builds its presence client over `createSignalRTransport` instead of a plain WebSocket. The UI still uses the same `@anchor-presence/react` hooks.

`createSignalRTransport` takes a `HubConnection` you build with `@microsoft/signalr`'s `HubConnectionBuilder`. It attaches the wire handlers, maps `HubConnectionState` onto core's `ConnectionStatus`, and drives `connect()` / `disconnect()` from `connection.start()` / `connection.stop()`.

If your app already uses [`use-signalr`](https://www.npmjs.com/package/@dammers/use-signalr-react) for its other hubs, see the docs page's "Already using use-signalr?" section for building the transport on that provider's connection instead.

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
cd apps/demo
bun run dev -- --open "/?backend=signalr"
```

The client serves at <http://localhost:5173/>. Open that address in two browser windows, both with `?backend=signalr`.

Add `&name=<name>` to change the cursor label. Add `&room=<name>` to use a room lane other than `main`.

## What the demo shows

Move the pointer in one window and the other window draws the same cursor on the same element, even at a different width. See the [root README](../../README.md) for the core idea.

## How the relay works

The hub groups connections by room and relays within the group.

```csharp
public partial class PresenceHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var room = RoomFor(Context.GetHttpContext());
        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        await base.OnConnectedAsync();
    }

    public Task OnPresence(string payload)
    {
        var room = RoomFor(Context.GetHttpContext());
        return Clients.OthersInGroup(room).SendAsync("PresenceReceived", payload);
    }
}
```

- A client connects with a `room` query parameter on the hub URL (`/hubs/presence?room=main`). `OnConnectedAsync` adds the connection to that room's group.
- A client sends an update by invoking the `OnPresence` hub method, passing the presence message as a base64 string, so any codec works.
- The hub sends the same string as a `PresenceReceived` event to every other connection in the same room.
- An invalid or missing room name falls back to `"main"` (see `RoomFor` in `Hub/PresenceHub.cs`).

## Receiver-side validation

The relay does not validate payloads beyond size. The receiving client does. Core validates every incoming message against the presence schema before it stores it.

## Stale cursor removal

When a window closes, the server drops the connection. The other clients stop receiving its updates. Core marks that client stale after `staleTimeoutMs` and removes its cursor. The default is `70000ms`.

To check this quickly, add `?stale-ms=12000&heartbeat-ms=2000` to the URL, then close one window. The other window removes its cursor within about 15 seconds.

## Transport adapter tests

The tests in `signalr.test.ts` use a minimal fake `HubConnection`. They do not use a real server. Run them from the repository root:

```sh
bunx vitest run --project signalr-example
```

They cover data delivery, dropping a send while the hub is not connected, and status mappings.

`signalr-hub.test.ts`, in the same project, runs the real `dotnet run` hub instead of a fake. It checks same-room relay, cross-room isolation, and an oversized frame being dropped instead of crashing the hub. It skips automatically when `dotnet` is not on `PATH`, so `bun run test` still passes on a machine without the .NET SDK.

### Running the hub test in CI

The main CI workflow (`.github/workflows/ci.yml`) does not install .NET, so `signalr-hub.test.ts` skips there today. To run it in CI, add a step before `bun run test`:

```yaml
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: "10.0.x"
```

No other CI change is needed: the test only activates when `dotnet --version` succeeds.

## Production notes (security baseline)

| Control                                 | Status                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room name validation (length + charset) | Yes — `RoomFor` in `Hub/PresenceHub.cs` matches `^[A-Za-z0-9_-]{1,256}$`, falling back to `"main"`.                                                     |
| Max payload size                        | Yes — `MaximumReceiveMessageSize = 32 * 1024` in `Program.cs`. SignalR closes the connection on an oversized frame rather than crashing the process.    |
| Per-connection rate limit               | **No.** ASP.NET Core has no built-in per-hub-method rate limiter. Add `Microsoft.AspNetCore.RateLimiting` if you need one.                              |
| Origin allowlist                        | Yes — `RELAY_ALLOWED_ORIGINS`, comma-separated, read in `Program.cs`. Defaults to `http://localhost:5173` for local dev.                                |
| Auth hook placeholder                   | **No.** Wire ASP.NET Core's standard `[Authorize]` attribute and an auth scheme on `PresenceHub` for real auth. This example has none.                  |
| Room cleanup on close                   | Yes — SignalR removes a closed connection from its groups automatically.                                                                                |
| Per-room / total connection caps        | **No.** Add `Microsoft.AspNetCore.RateLimiting` or a custom `IHubFilter` if you need a cap.                                                             |
| Backpressure on slow consumers          | Partial — SignalR buffers per connection and applies its own backpressure internally, but this example does not configure or expose a custom watermark. |

Set `RELAY_ALLOWED_ORIGINS` before exposing this beyond local development, and put it behind a TLS-terminating proxy.

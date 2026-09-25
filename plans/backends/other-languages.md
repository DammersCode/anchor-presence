# Other-language backends

Status: open (planning only, not scheduled)

This plan describes relay servers written in Go, Python, and Elixir. The wire protocol in `SPECIFICATION.md` is language-agnostic: a relay only needs to group sockets into rooms and forward opaque byte messages between them. It never decodes a message. A relay in any language that can run a WebSocket server can serve this library.

## Goal

Show that the protocol does not require a JavaScript or Bun runtime, and give users a starting point in three common backend languages.

## Why these three

- **Go**, using `coder/websocket` (formerly `nhooyr/websocket`): a small, actively maintained WebSocket library with a plain `net/http` handler shape, no framework dependency.
- **Python**, using FastAPI's built-in WebSocket support (`fastapi.WebSocket`): FastAPI is a common choice for Python backends already, and its WebSocket route is a normal `async def` handler with no extra library.
- **Elixir**, using Phoenix Channels: Channels are Phoenix's native pub/sub abstraction over WebSocket, built for exactly this kind of room-based broadcast, and come with reconnection and presence-tracking primitives already built into the framework (Phoenix Presence is a separate concern from Anchor Presence's own presence model; this plan uses only the channel/broadcast part).

## Approach

All three follow the same shape as `apps/server`:

1. Accept a WebSocket upgrade.
2. Read a room identifier from the URL path or a query parameter.
3. Track connected sockets per room, in memory (a map keyed by room name is enough at the scale `apps/server` targets; a multi-instance deployment needs a shared pub/sub layer instead, which is out of scope here).
4. On an inbound message, forward the raw bytes to every other socket in the same room. Never parse the message.
5. Enforce the same operational limits `apps/server` documents: a maximum message size, a per-socket rate limit, a room size cap, and a total connection cap.

### Go sketch

```go
func handleRoom(w http.ResponseWriter, r *http.Request) {
    conn, _ := websocket.Accept(w, r, nil)
    room := roomFromRequest(r)
    hub.Join(room, conn)
    defer hub.Leave(room, conn)
    for {
        _, data, err := conn.Read(r.Context())
        if err != nil {
            return
        }
        hub.Broadcast(room, conn, data)
    }
}
```

### Python sketch

```python
@app.websocket("/ws")
async def presence_room(websocket: WebSocket, room: str = "main"):
    await websocket.accept()
    hub.join(room, websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            await hub.broadcast(room, websocket, data)
    except WebSocketDisconnect:
        hub.leave(room, websocket)
```

### Elixir sketch

```elixir
defmodule PresenceWeb.RoomChannel do
  use Phoenix.Channel

  def join("room:" <> room_id, _params, socket), do: {:ok, socket}

  def handle_in("presence", {:binary, data}, socket) do
    broadcast_from!(socket, "presence", {:binary, data})
    {:noreply, socket}
  end
end
```

Phoenix Channels already exclude the sender from `broadcast_from!`, so the "forward to everyone but the sender" rule needs no extra code in that version.

## Transport sketch (client side)

No client-side change: `createWebSocketTransport({ url })` in `@anchor-presence/dom` already speaks plain WebSocket frames, so any of these three relays works with the existing client without a new adapter. This plan is entirely server-side.

## Security notes

- Binary WebSocket frames: confirm each framework defaults to binary frame handling for `Uint8Array` payloads (`coder/websocket` and FastAPI both do; Phoenix Channels needs the `{:binary, data}` tuple form shown above, since its default channel payload shape is JSON).
- Each relay must implement its own origin check and optional token check, matching `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` in `apps/server`. None of the three frameworks does this by default.
- State the same unauthenticated-identity model from `docs/security.md`: the relay forwards bytes without checking that a peer's claimed `clientId` belongs to them. Binding identity to a session, if a deployment needs that, is a job for the application layer in front of the relay, not the relay itself.
- Document each relay as a reference implementation, not a production-ready service, the same way `apps/server`'s README does.

## Test strategy

- One example directory per language (`examples/go`, `examples/python`, `examples/elixir`), each with its own relay, a short README with run instructions, and a client-side snippet using `createWebSocketTransport`.
- Since the client is already tested (`packages/dom/test/transport.test.ts`) and the protocol is opaque bytes, the relay-specific test is a raw two-socket forwarding check: connect two WebSocket clients to the same room, send bytes from one, assert the other receives the identical bytes, and assert a client in a different room receives nothing. This mirrors the raw-socket relay test pattern already used in `apps/server`.
- Run each example's test in the language's own native test runner (`go test`, `pytest`, `mix test`); these examples do not join the Bun/Vitest workspace, the same way `examples/signalr`'s .NET project runs under `dotnet test` instead.

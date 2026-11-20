# Edge and serverless backends

Status: open (planning only, not scheduled)

This plan describes two relay backends that run on edge platforms instead of a long-lived Bun process. It does not change `@dammers/anchor-presence-core`, `dom`, or `react`. Both backends implement the same job as `apps/server`: group WebSocket connections into rooms and forward each inbound message to the other sockets in the room.

## Goal

Give users a way to run the relay without managing a server, on a platform that bills per request or per active connection instead of per always-on instance.

## Why these two

- **Cloudflare Durable Objects**: one Durable Object instance per room gives strong, single-writer ordering for the room's socket list, with no external database. The WebSocket hibernation API lets Cloudflare evict an idle Durable Object from memory between messages and restore it on the next one, so an idle room costs close to nothing.
- **PartyKit**: a hosted layer over Durable Objects with a smaller API (one `Party` class per room, no manual hibernation bookkeeping). It trades some control for less code.

Both keep the "room" concept from `apps/server`, so the client-side `createWebSocketTransport({ path: "/party/main-room" })` pattern carries over unchanged. The wire format does not change: the relay never decodes the message, it only forwards bytes.

## Approach

### Cloudflare Durable Objects

1. One Durable Object class, `PresenceRoom`. The room name (from the URL path or a query parameter) maps to a Durable Object ID through `idFromName`.
2. On `fetch`, accept the WebSocket upgrade and call `state.acceptWebSocket(server)` (the hibernation API), instead of holding the socket in a plain event listener. This lets Cloudflare unload the object from memory while the socket stays open.
3. Implement `webSocketMessage(ws, message)`: look up the other sockets attached to this Durable Object with `state.getWebSockets()`, and forward the message to each one except the sender.
4. Implement `webSocketClose` and `webSocketError` to let Cloudflare clean up the closed socket. No explicit room-membership list is needed; `getWebSockets()` is the source of truth.
5. Attach room metadata (such as a join timestamp, for the size caps below) with `ws.serializeAttachment(...)`, since hibernation clears normal closure variables.

### PartyKit

1. One `Party.Server` class, `onConnect(conn, room)` and `onMessage(message, sender)`.
2. `onMessage` forwards to `room.getConnections()` except the sender, matching the Durable Object logic above.
3. PartyKit deploys with its own CLI; no Cloudflare account wiring beyond what PartyKit needs internally.

## Transport sketch

No new package. Both backends are documented as URLs a user points `createWebSocketTransport` at:

```ts
// Cloudflare Worker route, or a PartyKit party URL
const transport = createWebSocketTransport({
  url: "wss://presence.example.workers.dev/room/main",
});
```

The relay logic (join a room, forward bytes, drop the sender) is the only backend-specific code. Everything from `createPresenceClient` up is unchanged.

## Security notes

- Neither platform gives TLS termination or origin checking for free at the relay layer the way a reverse proxy might; both backends must check the `Origin` header themselves and reject a mismatch, the same way `RELAY_ALLOWED_ORIGINS` does in `apps/server`.
- Identity stays unauthenticated at the transport level, matching the rest of the library (see `docs/security.md`): a room name is a grouping key, not a credential. A token check (a query parameter checked in `fetch` before the upgrade) is the same shape as `RELAY_AUTH_TOKEN` in `apps/server`.
- Durable Objects and PartyKit both cap message size at the platform's WebSocket message limit; document the platform's number instead of re-implementing `MAX_MESSAGE_BYTES`, since the platform enforces its own cap regardless.
- Room size caps (`RELAY_MAX_ROOM_SOCKETS` in `apps/server`) need an explicit count check in `webSocketMessage`/`onConnect`, since neither platform caps room membership by default.

## Test strategy

- Unit test the room-forwarding logic against the platform's local dev tools (`wrangler dev` for Durable Objects, `partykit dev` for PartyKit), using two WebSocket clients against one local room.
- Reuse the existing `createInMemoryPair` core tests as the contract: any relay that forwards bytes unmodified between two `createPresenceClient` instances must pass the same end-to-end assertions the socket.io example uses in `examples/socketio`.
- Add one example directory per backend (`examples/cloudflare-do`, `examples/partykit`) once implementation starts, following the structure of `examples/socketio`: a relay, a thin client wiring snippet, and a node-only integration test where the platform's local dev server allows it.

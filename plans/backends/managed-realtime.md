# Managed realtime backends

Status: open (planning only, not scheduled)

This plan describes three managed pub/sub services as transport carriers for Anchor Presence: Supabase Realtime Broadcast, Ably, and Pusher. None of them need a server we run. Each one is a `PresenceTransport` implementation that sends bytes through the vendor's SDK instead of a raw WebSocket.

## Goal

Let a user who already has one of these services carry presence messages through it, with no relay to deploy or operate.

## Why these three

All three give a publish/subscribe channel abstraction with named channels (a natural fit for "room"), and all three have a JavaScript SDK that runs in the browser without a server-side component for the basic broadcast case.

- **Supabase Realtime Broadcast**: a channel is created client-side with `supabase.channel(name)`; `broadcast` sends an event to every other subscriber on the channel. No database write is needed for presence data itself (Supabase also has a separate "Presence" feature for online-user lists, which this plan does not use — Anchor Presence has its own presence model).
- **Ably**: channels plus a publish/subscribe API; supports binary payloads directly, which matches the library's `Uint8Array` wire format with no extra encoding step.
- **Pusher**: the oldest and most restrictive of the three. Pusher Channels' client API is push-only for a browser client by default (client events need a paid feature and a `client-` event-name prefix); document this limit up front so a user does not discover it after integrating.

## Approach

Each transport is a thin adapter: `send` publishes one message on the room's channel, `subscribe` listens for that event and hands the payload back as a `Uint8Array`, `subscribeStatus` maps the vendor SDK's connection state to `ConnectionStatus`. None of the three needs custom framing since Anchor Presence already encodes each message as a single opaque byte array.

```ts
// Sketch, not the final signature
function createSupabaseTransport(channel: RealtimeChannel): PresenceTransport;
function createAblyTransport(channel: Ably.RealtimeChannel): PresenceTransport;
function createPusherTransport(channel: Pusher.Channel, socket: Pusher): PresenceTransport;
```

These adapters live in `examples/`, not in a package, the same way the Socket.IO adapter does — the package boundary rule in `AGENTS.md` keeps third-party client libraries out of `@anchor-presence/dom`.

## Transport sketch

```ts
// Supabase
const channel = supabase.channel(`presence:${room}`);
const transport = createSupabaseTransport(channel);
channel.subscribe();
```

```ts
// Ably
const channel = ablyClient.channels.get(`presence:${room}`);
const transport = createAblyTransport(channel);
```

```ts
// Pusher
const channel = pusher.subscribe(`presence-${room}`);
const transport = createPusherTransport(channel, pusher);
```

## Binary payload handling

- Ably accepts `Uint8Array` directly.
- Supabase Realtime Broadcast sends JSON payloads over its channel; the adapter must base64-encode the `Uint8Array` before `broadcast` and decode it in the message handler. Document the size and latency cost of this extra encoding step.
- Pusher Channels also expects JSON-serializable payloads; the same base64 wrapping applies, and the 10 KB message size limit on Pusher's standard plan is a hard cap this transport cannot avoid — document it as a known limit next to the base64 note.

## Security notes

- All three services need a client-side credential (a public API key for Ably/Pusher, the anon key for Supabase). None of these credentials authenticate an individual user's identity inside Anchor Presence; the same unauthenticated-identity model documented in `docs/security.md` applies (`clientId` and `session` are still self-declared by each peer).
- Pusher's private/presence channels and Ably's token authentication both need a small server-side endpoint to mint a signed auth token; that endpoint is the only server-side code this plan introduces, and it is out of scope for the transport adapter itself (link to each vendor's authentication docs instead of reimplementing them).
- Rate limits and connection caps are the vendor's, not ours; document the free-tier concurrent-connection limits for each service as a practical ceiling for demo and small-team use.

## Test strategy

- Each adapter gets one example directory (`examples/supabase-realtime`, `examples/ably`, `examples/pusher`) modeled on `examples/socketio`: a transport file, a short usage README, and a node-only integration test where the vendor SDK works in Node (Ably's SDK does; Supabase's realtime client works over WebSocket in Node with the `ws` package; Pusher's server SDK is separate from its client SDK, so the Pusher example may need a lighter smoke test instead of a full round-trip).
- Where a vendor requires a live account and cannot run in CI, mark the integration test as skipped by default and document the manual verification steps (two browser tabs, one shared room) the way `examples/signalr`'s manual checks are documented today.

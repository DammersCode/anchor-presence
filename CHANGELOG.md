# Changelog

## Unreleased

### Breaking

- Example relays: the `authCheck` option now takes a request (`{ token, room, origin, headers }`) and may be async, so it can verify a JWT or authorize per room. It replaces the token-only signature.
- `@anchor-presence/dom`: the binding hides remote cursors while the client status is `reconnecting` or `disconnected`, and shows them again when the connection returns.
- `@anchor-presence/core`: `RemotePresence.idle` now measures the time since the last change, not since the last message. A still peer goes idle while its heartbeats keep arriving.
- `@anchor-presence/core`: `CursorPresence` gains an optional `leave` field. A relay that validates messages must pass it through.
- `@anchor-presence/react`: `usePresenceClient` is removed. Pass `LiveCursorProvider` a `factory` prop instead. The provider runs it once per mount, in a browser-only effect, and disposes the client it created on unmount. The `client` prop stays as bring-your-own: the provider never disposes a client you pass, and it wins over `factory` when both are set.
- `@anchor-presence/core`: `createPresenceClient` now defaults `autoConnect` to `true`. The client calls `transport.connect()` itself, once, during creation, after it subscribes to the transport's messages and status. Pass `autoConnect: false` to connect the transport yourself.

### Added

- `@anchor-presence/core`: `LiveCursorTransport.subscribeClose` and `client.subscribeClose` report why a connection closed (close code, reason and whether the transport reconnects). `createWebSocketTransport` implements it.
- `@anchor-presence/core`: `client.leave()` tells peers the client left; the next publish or heartbeat announces it again. `createDomBinding` calls it on `pagehide`, so a closed tab disappears at once.
- `@anchor-presence/core`: `client.sendEvent(type, data?)` and `client.subscribeEvents(listener)` carry one-shot events such as reactions or pings. Events are never stored or resent. Both codecs support them (binary cursor tag 3). `CursorPresence` gains an optional `event` field.
- `@anchor-presence/core`: `client.subscribePeers(listener)` reports remote clients that join or leave.
- `@anchor-presence/react`: `useCursorEvents(listener)` subscribes to remote events.
- `@anchor-presence/core`: a client answers a first message from an unknown peer, or a known `clientId` with a new session, with one full publish after up to 500 ms.
- `@anchor-presence/dom`: `createWebSocketTransport` takes a `token` function that runs before every connection attempt and may return a promise.
- `@anchor-presence/react`: `createPresenceHooks<TContext, TUser>()` returns the provider and every hook with the generics fixed, so `useRemoteUsers<Wrong>()` no longer compiles.
- `@anchor-presence/core`: `dispose()` sends an explicit leave message (`leave: true`, binary cursor tag 2). Receivers remove the client at once instead of after `staleTimeoutMs`.
- `@anchor-presence/core`: `createPresenceClient` takes `parseUser` and `parseContext` to check remote values. A rejected field is dropped, so a malformed peer cannot crash a render.
- `@anchor-presence/dom`: `createWebSocketTransport` takes `stableAfterMs` (default `5000`) and `shouldReconnect`. The backoff resets only after a connection stays open that long, so a relay that accepts and then rejects no longer causes a reconnect loop. A close with code 1008, 4004 or 4006 stops reconnecting by default.
- `@anchor-presence/core`: the store keeps the identity of `user` and `context` when a heartbeat repeats an equal value, so memoized renders stay stable.
- `@anchor-presence/dom`: `createWebSocketTransport` throws a clear error when no `url` is given and `window` is missing.
- `@anchor-presence/dom`: `WebSocketLike` accepts the platform `WebSocket` constructor without a cast.
- `@anchor-presence/react`: `LiveCursorProvider` takes a `factory` prop that creates the client it owns.
- `@anchor-presence/react`: `CursorLayer` takes a `zIndex` prop; cursors now default to `z-index: 9999` so they stay above most app UI, including dialogs.
- `@anchor-presence/dom`: `createDomBinding` takes `localCursorCapture` (default `true`). Set it to `false` for a read-only presence client that publishes no pointer input.
- `@anchor-presence/dom`: `createDomBinding` takes `captureFocus` (default `false`). When `true`, the client publishes a cursor at the center of the focused element on `focusin` and clears it on `focusout`.
- `@anchor-presence/core`: `isDevMode()` reports whether the client runs in a development environment.
- `@anchor-presence/core`: `RemotePresenceStore.hasActiveCursors()` and `PresenceClient.hasActiveCursors()` report whether any remote cursor has a non-`null` position.
- `@anchor-presence/core`: `Interpolator` takes an optional `sampleInto(out, timestampMs)` method that fills a caller-provided box instead of allocating.

### Changed

- `@anchor-presence/dom`: pointer capture caches the anchor chain per target and reuses it while the target and the registry generation stay the same.
- `@anchor-presence/dom`: the resolver reuses its per-frame containers and samples interpolators into scratch boxes, so a frame with no new work allocates nothing.

## 0.1.0 - 2026-09-26

First release.

### Packages

- `@anchor-presence/core`: protocol, codecs (`jsonCodec`, `binaryCodec`), remote presence store, and `createPresenceClient`, with no runtime dependencies.
- `@anchor-presence/core`: `RemotePresence` has `idle`; `RemotePresenceStore` and `createPresenceClient` take `idleAfterMs` (default `DEFAULT_IDLE_AFTER_MS`, clamped below `staleTimeoutMs`).
- `@anchor-presence/core`: `createPresenceClient` takes `autoConnect` (default `false`); when `true`, the client calls `transport.connect()` itself, once, during creation, after it subscribes to messages and status.
- `@anchor-presence/dom`: anchor registry, pointer capture, resolver with a fallback chain, and the native `WebSocket` transport.
- `@anchor-presence/dom`: `createDomBinding` uses no easing when the OS prefers reduced motion; `ResolvedCursor` has `idle`.
- `@anchor-presence/dom`: `createWebSocketTransport`'s `connect()` is idempotent: a second call while a socket is connecting or open does not open a second socket.
- `@anchor-presence/react`: provider, hooks, and cursor components.
- `@anchor-presence/react`: `useRemoteUsers` entries have `idle`; `CursorLayer` dims an idle cursor (no transition under reduced motion).
- `@anchor-presence/react`: `DefaultCursor` keeps its own colors under `forced-colors: active`.

### Skills

- `anchor-presence`: an agent skill that adds live cursors to a React app, or fixes a broken integration.
- `anchor-presence-audit`: an agent skill that measures a running app with Playwright, scores cursor-jump risk for each pair of layouts (jump, gap, depth, aspect, parity), and applies the fixes the user picks. `measure.mjs --fail-above <score>` can gate CI; the script also fails when a view cannot be measured. `"jumpScale": "viewport"` scores jumps relative to the receiver's viewport width.

### Examples and docs

- Relay examples for Bun, Node `ws`, Hono, Elysia, Socket.IO, and SignalR. Each has room validation, a message size cap, a rate limit, an origin allowlist, an auth hook, per-room and per-process connection caps (`RELAY_MAX_ROOM_SOCKETS`, `RELAY_MAX_TOTAL_SOCKETS`), and an integration test. The Bun, `ws`, Hono, and Elysia relays close dead connections with ping and pong (`RELAY_IDLE_TIMEOUT_SECONDS`) and handle slow receivers.
- `examples/signalr`'s `createSignalRTransport` takes a plain `@microsoft/signalr` `HubConnection`; the docs page shows how to reuse a `use-signalr` provider's connection.
- `apps/demo` picks its relay backend at runtime with `?backend=` (or `VITE_BACKEND`), uses a random room per visitor unless `?room=` is set, and meets WCAG AA (axe-checked in e2e).
- Docs site on Vercel at [anchor-presence.vercel.app](https://anchor-presence.vercel.app): guides, API reference, live example previews, search, `llms.txt`, and per-page Markdown for AI agents.

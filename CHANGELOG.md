# Changelog

## Unreleased

### Breaking

- `@anchor-presence/dom`: the binding option `maxAnchors` is `maxSentAnchors`. The `validationLimits.maxAnchors` limit keeps its name. `createDomBinding` errors now start with `createDomBinding:`.
- Example relays: with identity binding, a frame never carries a `user` that the peer chose. The relay writes the `user` of the identity, or removes the field when the identity has none.
- Example relays: with identity binding, a frame that is not a JSON object (for example `binaryCodec`) closes the connection with code `1008` instead of being dropped silently. The reference relay takes an `authCheck` through `startReferenceRelay` and binds identity like the example relays.
- `@anchor-presence/core`: the default clock is monotonic (`performance.now()`), so a wall-clock step no longer leaves ghost peers or mutes event senders. Pass `now` to use another clock.
- `@anchor-presence/core`: `binaryCodec.encode` throws for a coordinate outside the float32 range and for an event message that carries a cursor. The client drops such a message.
- `@anchor-presence/dom`: `createWebSocketTransport` throws a `TypeError` for a `path` that does not start with `/` or `?`.
- `@anchor-presence/core`: the client option `onRemoteClientDrop` is `onRemoteClientRejected`, and the store option `onDropNewClient` is `onRemoteClientRejected`. Both run when a full store refuses a new peer, and receive `{ clientId }`.
- Renames, so that `Presence` names the connection and `Cursor` names what you see: `LiveCursorProvider` is `PresenceProvider`, `LiveCursorContext` is `PresenceProviderContext`, `LiveCursorTransport` is `PresenceTransport`, `CursorPresence` is `PresenceMessage`, `CursorCodec` is `PresenceCodec`, `useCursorClient` is `usePresenceClient`, `useCursorStatus` is `usePresenceStatus`, `useCursorBinding` is `useDomBinding`, and `useCursorEvents` is `useRemoteEvents`.
- Renames, for names that say what they do: `useCursorContext` is `useLocalContext`, `useCursorPresence` is `useRemotePresence`, `client.updateLocalCursor` is `setLocalCursor`, the option `heartbeatMs` is `heartbeatIntervalMs` (and `DEFAULT_HEARTBEAT_MS` is `DEFAULT_HEARTBEAT_INTERVAL_MS`), and the binding option `localCursorCapture` is `capturePointer`.
- `@anchor-presence/core`: `createPresenceClient` throws a `TypeError` for a non-finite `publishIntervalMs`, `heartbeatIntervalMs`, `staleTimeoutMs`, `idleAfterMs`, `maxRemoteClients` or adaptive-publish option, instead of running with a broken timer.
- `@anchor-presence/core`: `PeerChange` is generic and carries the peer's `user` and `context`. For a `leave`, they hold the last known values.
- Example relays: the node-ws relay counts only admitted sockets against `maxSockets` and terminates a refused socket after one second, so a flood of refused clients that ignore the close frame cannot fill the cap.
- Example relays: the node-ws relay survives any request that fails inside the upgrade handler, such as a malformed request target. Bun and Hono check origin and room before they call `authCheck`. Receivers drop an identity with a `clientId` above 100 characters.
- Example relays: node-ws and Bun answer a path other than `/` with 404. Rooms come from the `room` query parameter. The node-ws relay no longer exits when a client resets the connection while an async `authCheck` runs.
- `@anchor-presence/core`: the default shape check accepts a remote `null` for any key, and the dev console warns once when it drops a remote `user` or `context`.
- `@anchor-presence/core`: a remote `user` or `context` must have the shape of the local value, or the client drops it. A key the local value lacks, such as an optional field, stays only as a string, number, boolean or `null`. Pass `parseUser` or `parseContext` to replace the check, for example when the client has no local value.
- Relays (reference and examples): a room name that is not valid now closes the socket with code `4007` instead of falling back to `main`, because two rooms would share one stream. The SignalR hub aborts the connection.
- Example relays: identity binding rewrites `clientId` to `<identity>~<connection>`, so two tabs of one user stay two clients. It works on node-ws, Bun, Hono, Elysia and Socket.IO.
- `@anchor-presence/core`: an event that fails validation is dropped. `sendEvent` returns `false` for an event above the field limits. A failing teardown no longer stops `dispose()`.
- `@anchor-presence/dom`: a throwing `visibilityPolicy` or interpolator no longer stops the frame loop. The binding keeps the last snapshot and retries on the next change.
- `@anchor-presence/core`: the default `clientId` and `session` are 12 URL-safe characters (72 random bits) instead of UUIDs. Every message gets about 48 bytes smaller: a steady cursor is 106 bytes in the binary codec and 261 bytes in JSON.
- `@anchor-presence/dom`: `binding.dispose()` clears the local cursor on the client, so a consumer-owned client leaves no ghost cursor on peers.
- Example relays: the `authCheck` option now takes a request (`{ token, room, origin, headers }`) and may be async, so it can verify a JWT or authorize per room. It replaces the token-only signature.
- `@anchor-presence/dom`: the binding hides remote cursors while the client status is `reconnecting` or `disconnected`, and shows them again when the connection returns.
- `@anchor-presence/core`: `RemotePresence.idle` now measures the time since the last change, not since the last message. A still peer goes idle while its heartbeats keep arriving.
- `@anchor-presence/core`: `PresenceMessage` gains an optional `leave` field. A relay that validates messages must pass it through.
- `@anchor-presence/react`: The old hook that created a client inside the tree is removed. Pass `PresenceProvider` a `factory` prop instead. The provider runs it once per mount, in a browser-only effect, and disposes the client it created on unmount. The `client` prop stays as bring-your-own: the provider never disposes a client you pass, and it wins over `factory` when both are set.
- `@anchor-presence/core`: `createPresenceClient` now defaults `autoConnect` to `true`. The client calls `transport.connect()` itself, once, during creation, after it subscribes to the transport's messages and status. Pass `autoConnect: false` to connect the transport yourself.

- `@anchor-presence/core`: `createPresenceClient` throws a `TypeError` when `options.transport` is missing, or when `clientId` is not 1 to 128 characters. Every option error message starts with `createPresenceClient:`.
- `@anchor-presence/react`: the `PresenceProvider` props type needs `client` (or `null`) or `factory`, and rejects `binding` together with `bindingOptions`.
- Example relays and the reference relay: a repeated `room` query value closes the socket with `4007`, and a repeated `token` value with `4006`.

### Added

- `@anchor-presence/dom`: `ResolvedCursor` has `pointerType` (`"mouse"`, `"pen"` or `"touch"`), and `@anchor-presence/react`: `CursorRenderProps` passes it to `renderCursor`. A change of pointer type alone updates the cursor.
- `@anchor-presence/core`: `room.dispose()` on `createInMemoryRoom` disconnects and forgets every side, a disconnected side leaves the delivery set until `connect()`, a throwing listener no longer throws into the sender or stops later peers, and the type `InMemoryRoomOptions` is exported.
- `@anchor-presence/dom` and `@anchor-presence/react`: the `PointerType` type is exported.
- `@anchor-presence/dom`: `DomBinding.getAnchorElement(anchorId)` returns the element the binding resolves for an anchor ID, or `null`.
- `@anchor-presence/core`: `createInMemoryRoom` returns a room. Each `join()` gives a transport that reaches every other joined transport, for tests with three or more clients.
- `@anchor-presence/core`: `createEventChannel` has `EventMap` as the default for its type argument. The `DEFAULT_HEARTBEAT_INTERVAL_MS`, `staleTimeoutMs` and dom `*Like` type docs state their defaults and purpose.

- `@anchor-presence/core`: when a `user` or `context` cannot encode, the client drops only the failing field and keeps the other. The default shape check warns once in development when it drops a key, and skips keys such as `toString` that exist on `Object.prototype`.
- `@anchor-presence/dom`: the transport warns once in development after four failed connection attempts in a row, and when `url` overrides `host`, `port` or `path`. A binding works with elements of an iframe, because the checks use `nodeType` instead of `instanceof`.
- `@anchor-presence/dom`: a captured pointer runs its hit test at most once per 50 ms.
- Example relays: the token bucket reads a monotonic clock. An identity with `~` in its `clientId` is refused. The Socket.IO relay joins `room:<name>` so a socket id cannot name a room.
- Docs site: diagram frames scroll by keyboard.
- `@anchor-presence/react`: `useSendEvent()` sends typed events without `createPresenceHooks`. `CursorLayer` labels cut a name at 32 characters, and a `zIndex` or `transition` in `getCursorProps` wins over the defaults.
- `@anchor-presence/core`: A listener that throws prints an error in development. `isDevMode` is off in a production bundle from any bundler that replaces `process.env.NODE_ENV`. A `user` or `context` that cannot encode no longer stops the cursor: the client sends the cursor without them and warns once.
- `@anchor-presence/dom`: the pointer source ignores a second touch or pen contact. A keyboard focus cursor clears the pointer type. `createWebSocketTransport` reports `disconnected` and warns when no `WebSocket` exists. `createBroadcastChannelTransport` can reconnect after `disconnect()` and ignores payloads that are not byte views.
- Reference relay: it checks origin, then room name, then the token, like every example relay.
- Example relays: node-ws, Elysia and Socket.IO check the room name before they call `authCheck`, so the hook never sees a made-up room. Socket.IO caps one message at 4 times `MAX_MESSAGE_BYTES` (at least 1 MiB) and drops a larger one instead of closing the connection.
- Example relays: Hono uses Bun publish and subscribe. The node-ws relay corks its writes, starts under Node with `dev:relay:node`, and closes within two seconds.
- `@anchor-presence/core`: `createEventParser<TEvents>(parsers)` builds a typed `parseEvent` from one data parser per event type. A parser that returns `undefined` drops the event, and `null` declares an event without data. An event map can be an `interface`.
- `@anchor-presence/core`: `warnOnce(key, message)` prints a development warning once. The sibling packages share it.
- Reference relay and Bun examples: rooms use Bun publish and subscribe, the default room cap is 64, the rate limit refills 40 tokens per second, and `maxPayloadLength` caps one frame. The node-ws and Socket.IO relays use the same defaults.
- `@anchor-presence/dom`: a cursor message rounds `u` and `v` to four decimals, which makes a JSON frame about a quarter smaller.
- `@anchor-presence/dom`: the pointer source resolves the anchor under the pointer while the pointer is captured.
- CI and gates: `check:package` (publint and are-the-types-wrong), `check:unused` (knip), and `test:bun-runtime` runs a Node relay and a Bun relay with real clients under Bun.
- `@anchor-presence/dom`: `createBroadcastChannelTransport(channelName)` connects the tabs and iframes of one origin with no server.
- Development warnings, once each, for a hook outside `PresenceProvider`, a provider with neither `client` nor `factory`, `binding` together with `bindingOptions`, a dropped inbound message, a duplicate `clientId`, and a `staleTimeoutMs` of at most twice `heartbeatIntervalMs`. The WebSocket transport warns on each relay close with a code of 4000 or more.
- `@anchor-presence/core`: `createEventChannel<TEvents>(client)` gives typed `send` and `subscribe` for events. The client option `eventRateLimit` sets the per-sender burst and rate and a total rate for all senders. `client.subscribeUser(listener)` reports local `setUser` changes.
- `@anchor-presence/react`: `useLocalUser()`, `usePeerChanges(listener)`, and a third type parameter on `createPresenceHooks<TContext, TUser, TEvents>()` that types `useRemoteEvents` and adds `useSendEvent()`.
- The demo has live reactions and chat built on events, with end-to-end tests for events, leaving and peer notices.
- `@anchor-presence/react`: `useDomBinding()` returns the DOM binding, so a component can call `binding.invalidate()` when state that a `visibilityPolicy` reads changes.
- Example transports: the Socket.IO and SignalR transports implement `subscribeClose`. The relays send a `refused` event with the close code (4001, 4002, 4006, 4007) before they disconnect a client.
- `defineRelayConformance` also checks the origin allowlist (close code 4004).
- `@anchor-presence/core`: `createPresenceClient` takes `parseEvent`. It checks, rewrites or drops each remote event, so event data gets the same protection as `user` and `context`.
- `@anchor-presence/dom`: `binding.dispose({ keepLocalCursor: true })` keeps the local cursor on peers. `PresenceProvider` uses it when only `bindingKey` changes.
- Example Elysia client: `createElysiaClient(baseUrl, room, token?)` sends the room token.
- `@anchor-presence/core`: `subscribePeers` also reports an `update` when a remote `user` or `context` changes. A sender that floods events is limited to a burst of 20 and 10 per second.
- Example relays: an `authCheck` can return `{ clientId, user }`. The node-ws relay then rewrites those fields in every JSON frame, so a peer cannot claim another identity or send a leave for another client. `defineRelayConformance` in `examples/_shared` tests any relay.
- `bun run perf:score` measures bundle size, wire size, core hot paths, heap per message and, with `--relay`, relay latency, and scores each against a budget.
- `@anchor-presence/react`: `PresenceProvider` takes `clientKey`. Change it to dispose the client the factory made and create a new one, for example to switch rooms without remounting the subtree.
- `@anchor-presence/core`: after a reconnect the client marks every remote client unconfirmed. An entry that no heartbeat refreshes within `2 * heartbeatIntervalMs + 5 s` is removed, so peers that left during the outage do not linger.
- `@anchor-presence/react`: `PresenceProvider` takes `bindingKey`. Change it to rebuild the binding with the current `bindingOptions` while the client stays connected. The demo uses it for the interpolator switch.
- `@anchor-presence/core`: `PresenceTransport.subscribeClose` and `client.subscribeClose` report why a connection closed (close code, reason and whether the transport reconnects). `createWebSocketTransport` implements it.
- `@anchor-presence/core`: `client.leave()` tells peers the client left; the next publish or heartbeat announces it again. `createDomBinding` calls it on `pagehide`, so a closed tab disappears at once.
- `@anchor-presence/core`: `client.sendEvent(type, data?)` and `client.subscribeEvents(listener)` carry one-shot events such as reactions or pings. Events are never stored or resent. Both codecs support them (binary cursor tag 3). `PresenceMessage` gains an optional `event` field.
- `@anchor-presence/core`: `client.subscribePeers(listener)` reports remote clients that join or leave.
- `@anchor-presence/react`: `useRemoteEvents(listener)` subscribes to remote events.
- `@anchor-presence/core`: a client answers a first message from an unknown peer, or a known `clientId` with a new session, with one full publish after up to 500 ms.
- `@anchor-presence/dom`: `createWebSocketTransport` takes a `token` function that runs before every connection attempt and may return a promise.
- `@anchor-presence/react`: `createPresenceHooks<TContext, TUser>()` returns the provider and every hook with the generics fixed, so `useRemoteUsers<Wrong>()` no longer compiles.
- `@anchor-presence/core`: `dispose()` sends an explicit leave message (`leave: true`, binary cursor tag 2). Receivers remove the client at once instead of after `staleTimeoutMs`.
- `@anchor-presence/core`: `createPresenceClient` takes `parseUser` and `parseContext` to check remote values. A rejected field is dropped, so a malformed peer cannot crash a render.
- `@anchor-presence/dom`: `createWebSocketTransport` takes `stableAfterMs` (default `5000`) and `shouldReconnect`. The backoff resets only after a connection stays open that long, so a relay that accepts and then rejects no longer causes a reconnect loop. A close with code 1008, 4004, 4006 or 4007 stops reconnecting by default.
- `@anchor-presence/core`: the store keeps the identity of `user` and `context` when a heartbeat repeats an equal value, so memoized renders stay stable.
- `@anchor-presence/dom`: `createWebSocketTransport` throws a clear error when no `url` is given and `window` is missing.
- `@anchor-presence/dom`: `WebSocketLike` accepts the platform `WebSocket` constructor without a cast.
- `@anchor-presence/react`: `PresenceProvider` takes a `factory` prop that creates the client it owns.
- `@anchor-presence/react`: `CursorLayer` takes a `zIndex` prop. Cursors default to `z-index: 9999`, so they stay above most app UI. A native modal `<dialog>` and a `popover` render in the top layer, above every `z-index`.
- `@anchor-presence/dom`: `createDomBinding` takes `capturePointer` (default `true`). Set it to `false` for a read-only presence client that publishes no pointer input.
- `@anchor-presence/dom`: `createDomBinding` takes `captureFocus` (default `false`). When `true`, the client publishes a cursor at the center of the focused element on `focusin` and clears it on `focusout`.
- `@anchor-presence/core`: `isDevMode()` reports whether the client runs in a development environment.
- `@anchor-presence/core`: `RemotePresenceStore.hasActiveCursors()` and `PresenceClient.hasActiveCursors()` report whether any remote cursor has a non-`null` position.
- `@anchor-presence/core`: `Interpolator` takes an optional `sampleInto(out, timestampMs)` method that fills a caller-provided box instead of allocating.

### Changed

- `@anchor-presence/dom`: the dev warning "does not reconnect" no longer fires when your own `shouldReconnect` declines a close code.
- `@anchor-presence/core`: a transport that joins an in-memory room while a message is delivered does not receive that message. `createInMemoryPair` ignores `connect()` after `dispose()`, as the room does. `createInMemoryPair().dispose()` sets both sides to `disconnected` and notifies their status listeners, as the room does.
- `@anchor-presence/core`: the in-memory transports isolate a throwing status listener on every status change, and the room updates its delivery set after the throw. `dispose()` still clears every side.
- `@anchor-presence/dom`: a pointer event with an unknown `pointerType` clears the pointer info a peer sees instead of keeping the last one.
- Reference relay: `createReferenceRelay(port, options)` returns `{ url, close }`, and the origin check runs before `authCheck`.
- `@anchor-presence/dom`: a throwing status listener of `createWebSocketTransport` is reported through the development error log, as in the other transports.
- `@anchor-presence/dom`: `createWebSocketTransport` throws a `TypeError` for a `baseBackoffMs` or `maxBackoffMs` that is not a positive finite number, and when `maxBackoffMs` is below `baseBackoffMs`. A failed connection attempt that throws before a socket exists (a URL without a scheme, a rejecting `token` function) counts toward the dev warning after 4 failures in a row.
- `@anchor-presence/core`: `createPresenceClient` throws a `TypeError` for a transport without `subscribe`, and for a `maxRemoteClients` that is not an integer of at least 1.
- `@anchor-presence/react`: `PresenceProvider` throws a `TypeError` when `factory` is not a function, for example a client object. Pass a client with the `client` prop.
- Example relays: the Elysia relay checks size and rate on the raw frame, so a text frame reaches peers unchanged. Hono and Bun do not call the auth hook for a request without an `Upgrade` header. The Socket.IO relay refuses an origin outside the allowlist with code `4004` in `connect_error`, so the client stops retrying.
- `@anchor-presence/dom`: a failed connection attempt (a rejecting `token` function or a throwing `WebSocketCtor`) asks `shouldReconnect` like a close does. A `false` answer stops the retries.
- `@anchor-presence/dom`: `connect()` during the reconnect backoff cancels the pending timer, so it no longer opens a second socket. `WebSocketTransport` types `subscribeStatus`, `getStatus`, `subscribeClose` and `bufferedBytes` as required.
- `@anchor-presence/core`: the `clientId` length check uses `validationLimits.maxClientIdLength`. `createPresenceClient` throws a `TypeError` when `idFactory` returns a session of 0 or more than 64 characters.
- `@anchor-presence/react`: `PresenceProvider` warns in dev when a caller passes both `client` and `factory`; `client` wins.
- `@anchor-presence/react`: `CursorLayer` without `getLabel` labels a cursor with `user.name` when it is a string that is not empty. Without `getColor`, each client gets one color from a palette of 8 colors, picked from its `clientId`.
- `@anchor-presence/react`: the package entry starts with `"use client"`, so React Server Components frameworks treat it as client code.
- `@anchor-presence/dom`: `createWebSocketTransport` stops reconnecting after a close with code `4007` (room name not valid).
- `@anchor-presence/dom`: pointer capture caches the anchor chain per target and reuses it while the target and the registry generation stay the same.
- `@anchor-presence/dom`: the resolver reuses its per-frame containers and samples interpolators into scratch boxes, so a frame with no new work allocates nothing.
- `@anchor-presence/core`: a client created on an already connected transport announces its user and context at once, without waiting for a cursor or the first heartbeat.
- `@anchor-presence/core`: `validationLimits.maxSessionLength` also applies to the local `session` that `createPresenceClient` checks.
- `@anchor-presence/react`: `PresenceProviderConfig` is the provider props without `children`, so a wrapper component can pass them through and keep the `client` or `factory` rule.
- `@anchor-presence/dom`: a throwing `binding.subscribe` listener no longer stops the other listeners or the frame loop. Transitions of `opacity`, `color`, `background-color`, `box-shadow` and `filter`, and transitions inside a cursor element, no longer re-measure anchors.
- `@anchor-presence/react`: `usePresenceStatus` returns `"connecting"`, not `"disconnected"`, while a provider `factory` has not created its client, so the server and first render do not flash a disconnected state.
- `@anchor-presence/react`: the default cursor label is cut at 32 characters by grapheme cluster, so a flag or family emoji at the limit stays whole.

## 0.1.0 - 2026-09-26

First release.

- `@anchor-presence/dom`: a throwing `shouldReconnect` counts as `false` and no longer leaves the status stuck.
- `@anchor-presence/dom`: `startAutoRegister` frees an id for a duplicate anchor when the newer one changes or loses its attribute.
- `@anchor-presence/core`: the `staleTimeoutMs` dev warning also covers the default timeout, and `binaryCodec.encode` throws a `TypeError` for an invalid anchor, like it does for an invalid viewport.
- `@anchor-presence/core`: the dev warning for a failed send also names a transport send failure.
- `@anchor-presence/core`: after `room.dispose()`, `createInMemoryRoom` ignores `join()` connects and sends, and a throwing listener on an `createInMemoryPair` side no longer stops the other listeners or throws into the sender.
- `@anchor-presence/dom`: `createWebSocketTransport` warns once in dev when a close with a code below 4000 (for example 1008) ends reconnecting.

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

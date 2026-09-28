# Changelog

## Unreleased

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

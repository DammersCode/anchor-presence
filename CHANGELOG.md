# Changelog

## Unreleased

- demo: cursor label colors meet WCAG AA contrast (4.5:1) against their white label text; the connection status pill exposes `role="status" aria-live="polite"` and gives `reconnecting` a distinct dot animation from `connecting`; the default room (no `?room=`) is now random per visitor instead of the shared `main` room.
- examples: `apps/demo` picks its relay backend at runtime with `?backend=` (or `VITE_BACKEND`), so one demo client works against every backend example.
- examples: add `bun-native`, `node-ws`, `hono`, and `elysia` relay examples, each with a security baseline (room validation, size cap, rate limit, origin allowlist, auth hook placeholder) and an integration test.
- examples: `socketio` and `signalr` gain the same security baseline; the SignalR hub now relays per room instead of to every connection.
- examples: `examples/socketio/client` and `examples/signalr/client` are removed. Use `apps/demo` with `?backend=socketio` or `?backend=signalr` instead.

## 0.1.0 - unreleased

- `@anchor-presence/core`: initial release
- `@anchor-presence/core`: `RemotePresence` gains `idle`; `RemotePresenceStore` and `createPresenceClient` gain `idleAfterMs` (default `DEFAULT_IDLE_AFTER_MS`, clamped below `staleTimeoutMs`)
- `@anchor-presence/dom`: initial release
- `@anchor-presence/dom`: `createDomBinding` defaults to no easing when the OS prefers reduced motion
- `@anchor-presence/dom`: `ResolvedCursor` gains `idle`
- `@anchor-presence/react`: initial release
- Docs: the GitHub Pages landing page is replaced by a Fumadocs site (`apps/docs`), deployed on Vercel at
  [anchor-presence.vercel.app](https://anchor-presence.vercel.app). It carries the full guide and API
  reference content that used to live in `docs/*.md`, plus live in-browser demos, search, and `llms.txt`
  for AI agents.
- `@anchor-presence/react`: `useRemoteUsers` entries gain `idle`; `CursorLayer` dims an idle cursor's opacity (no transition under reduced motion)
- `@anchor-presence/react`: `DefaultCursor` keeps its own colors under `forced-colors: active` instead of flattening to system colors

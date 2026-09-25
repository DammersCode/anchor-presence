# Changelog

## Unreleased

- examples: `apps/demo` picks its relay backend at runtime with `?backend=` (or `VITE_BACKEND`), so one demo client works against every backend example.
- examples: add `bun-native`, `node-ws`, `hono`, and `elysia` relay examples, each with a security baseline (room validation, size cap, rate limit, origin allowlist, auth hook placeholder) and an integration test.
- examples: `socketio` and `signalr` gain the same security baseline; the SignalR hub now relays per room instead of to every connection.
- examples: `examples/socketio/client` and `examples/signalr/client` are removed. Use `apps/demo` with `?backend=socketio` or `?backend=signalr` instead.

## 0.1.0 - unreleased

- `@anchor-presence/core`: initial release
- `@anchor-presence/dom`: initial release
- `@anchor-presence/react`: initial release
- Docs: the GitHub Pages landing page is replaced by a Fumadocs site (`apps/docs`), deployed on Vercel at
  [anchor-presence.vercel.app](https://anchor-presence.vercel.app). It carries the full guide and API
  reference content that used to live in `docs/*.md`, plus live in-browser demos, search, and `llms.txt`
  for AI agents.

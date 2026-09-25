# 024 Backend examples

Status: in progress · Branch: `examples-backends` · Worktree: `C:/repos/danny/ap-wt-backends`

## Goal

Show the library on the most common live-data backends. Remove the duplicated example clients.

## Scope

- Implement: Bun native WebSocket, Node `ws`, Hono, Elysia. Keep and harden Socket.IO and SignalR.
- Plan only: edge and serverless, managed realtime, other languages (`plans/backends/`).

## Spec

- One demo client: `apps/demo` selects the backend at runtime (query `?backend=` or `VITE_BACKEND`). Each `examples/<name>/` holds only its server, a client transport if it needs a third-party client library, a README, and an integration test.
- Bun native, Node `ws`, Hono, and Elysia use `createWebSocketTransport` from `@anchor-presence/dom` on the client.
- Every server exports `createXRelay(port) → { url, close }` and has a runnable entry.
- Integration test per backend: two real `createPresenceClient`s through the real server. It checks same-room relay, cross-room isolation, disconnect cleanup, and that invalid or oversized frames are dropped.
- SignalR: the hub uses groups per room (`Groups.AddToGroupAsync`, `Clients.OthersInGroup`). A real test starts the ASP.NET Core hub and skips when `dotnet` is not on `PATH`. CI runs it with `setup-dotnet`.

## Security baseline (every example server)

1. Message size cap at or below 32 KiB, enforced before parse and fan-out.
2. Per-connection rate limit (token bucket).
3. Per-room and process-wide connection caps, configurable through env.
4. Slow-consumer backpressure: check the per-peer buffer before send; skip or close past a hard watermark.
5. Opt-in Origin allowlist through env, checked when the connection opens.
6. Opt-in auth hook for room access. It is room access control, not presence-data authentication.
7. Ping/pong idle detection that closes dead connections.
8. Fan-out only to the sender's room.
9. Room names: length cap and charset `[A-Za-z0-9_-]`. Never interpolated into paths, commands, or logs.
10. The README names each item from 1–9 that the example does not implement.

`apps/server` is the reference relay. Its token check uses `timingSafeEqual`.

## Acceptance

- All root gates pass. Every backend integration test passes locally.
- `examples/*/client` no longer exist. The e2e suite stays green.
- Each backend has a docs page (see plan 023).

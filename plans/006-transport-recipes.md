# Plan 006: Ship a working, tested Socket.IO transport example and verify the SignalR recipe

> **Executor instructions**: Follow step by step; verify each step; STOP
> conditions are binding. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- docs/transports.md examples packages/core/src/transport.ts`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: docs
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

The library's whole transport story is "bring any transport" (SPECIFICATION.md Invariant 6), but only the native-WebSocket path has running code (`apps/demo/src/cursors/transport.ts`). The Socket.IO and SignalR adapters exist as untested sketches in `docs/transports.md`. One REAL, integration-tested Socket.IO example validates the `LiveCursorTransport` interface against a library with its own framing/rooms, and turns the docs sketch into copyable truth. Owner selected this item explicitly ("we can do 4").

## Current state

- `packages/core/src/transport.ts` — the interface (verbatim):

```ts
export interface LiveCursorTransport {
  connect?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
  send(data: Uint8Array): Promise<void> | void;
  subscribe(listener: (data: Uint8Array) => void): () => void;
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
}
```

`ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected"`.
- `packages/core` exposes `createPresenceClient` — a client is fully usable WITHOUT any DOM (node): construct with a transport, call `updateLocalCursor({anchors:[…]})`, read `getRemoteSnapshot()` — this is what makes a node-only integration test possible.
- `docs/transports.md` — has the interface, a WebSocket example, a Socket.IO sketch, a SignalR sketch, a BroadcastChannel example. Written in Simplified Technical English (short sentences, imperative procedures, no "should").
- No `examples/` directory exists. Workspaces glob in root package.json is `["packages/*", "apps/*"]` — an `examples/*` entry must be ADDED for the example to resolve workspace deps.
- Monorepo rules: Bun everywhere; tests via Vitest projects in root `vitest.config.ts` (`core` node-env project pattern to copy).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `bun install` | exit 0 |
| Example test only | `bunx vitest run --project socketio-example` | pass |
| Full gate | `bunx vitest run && bunx tsc --build packages/core packages/dom packages/react` | green |

## Scope

**In scope**: `examples/socketio/` (create: package.json, `transport.ts`, `server.ts`, `README.md`), root `package.json` (workspaces glob + nothing else), `vitest.config.ts` (one added project entry), `docs/transports.md` (replace the Socket.IO sketch with a pointer to the tested example; correct the SignalR sketch per Step 4).
**Out of scope**: `packages/*` source (transport interface is FROZEN — if the example cannot be built against it, that is a STOP-worthy finding, not a license to change core), `apps/*`, any new dependency outside `examples/socketio`.

## Git workflow

Branch `advisor/006-transports`; plain commit messages, no AI mention; no push unless instructed.

## Steps

### Step 1: Scaffold `examples/socketio`

`examples/socketio/package.json`: private, name `example-socketio`, deps `socket.io`, `socket.io-client` (latest 4.x), `@anchor-presence/core "workspace:*"`. Add `"examples/*"` to root workspaces. `bun install`.

**Verify**: `bun install` exit 0; `bun pm ls` (or lockfile inspection) shows socket.io only under the example.

### Step 2: Implement the transport adapter

`examples/socketio/transport.ts`: `createSocketIoTransport(socket: Socket): LiveCursorTransport` — `send` emits a binary event (e.g. `socket.emit("presence", data)`); `subscribe` listens for `"presence"` normalizing incoming `ArrayBuffer|Buffer|Uint8Array` to `Uint8Array`; `subscribeStatus` maps socket lifecycle (`connect`→connected, `disconnect`→disconnected, `io reconnect_attempt`→reconnecting, initial→connecting); `disconnect()` calls `socket.disconnect()`. ~60 lines. `server.ts`: minimal Socket.IO server relaying `"presence"` to the sender's room peers (`socket.to(room).emit`), room from handshake query.

**Verify**: `bunx tsc --noEmit` inside the example (add a small tsconfig extending the base) — clean.

### Step 3: Integration test (node, no DOM)

`examples/socketio/socketio.test.ts` + a `socketio-example` node-env project in `vitest.config.ts`: start the server on an ephemeral port; create two `createPresenceClient`s, each with `createSocketIoTransport(io(url, {query:{room}}))`; client A `updateLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] })`; poll until client B's `getRemoteSnapshot()` contains A's clientId with that cursor; assert sequence/session fields sane; then disconnect A and assert B's status handling unaffected. Use real timers with a bounded poll (vi.waitFor). Close server + sockets in afterEach (no leaked handles — vitest must exit cleanly).

**Verify**: `bunx vitest run --project socketio-example` passes; `bunx vitest run` (all projects) passes and the process exits without hanging.

### Step 4: Docs truth pass

`docs/transports.md`: Socket.IO section now shows the tested adapter (short excerpt + link to `examples/socketio/transport.ts`). SignalR section: verify the sketch against the current `@microsoft/signalr` API docs (method names: `HubConnectionBuilder`, `connection.on`, `connection.send`, `onreconnecting`/`onreconnected`/`onclose`; binary payloads: SignalR JSON protocol base64-encodes `Uint8Array` — note this, or recommend MessagePack hub protocol) — correct the sketch, clearly labeled "sketch, not tested". Keep STE style: sentences ≤ 20/25 words, imperative procedures, no "should/may/might", "for example" not "e.g.".

**Verify**: `grep -n "examples/socketio" docs/transports.md` ≥ 1; no "should" introduced: `grep -in " should " docs/transports.md` → no new matches.

## Test plan

The Step 3 integration test IS the deliverable's test: two real Socket.IO clients exchanging presence through the real relay, node-only. Model project config on the existing `core` entry in `vitest.config.ts`.

## Done criteria

- [ ] `bunx vitest run` green including `socketio-example`, process exits cleanly
- [ ] `packages/*` untouched (`git diff --stat -- packages` empty)
- [ ] Root workspaces glob includes `examples/*`; socket.io deps exist ONLY in the example
- [ ] docs updated per Step 4 greps
- [ ] `plans/README.md` updated

## STOP conditions

- The `LiveCursorTransport` interface cannot express something Socket.IO needs (e.g. an async ready state that `subscribeStatus` cannot model) — this is an architecture finding; report it, do not patch core.
- The integration test is flaky across 3 consecutive full runs — report timings; do not mask with long sleeps.
- CI (plan 001) slows by more than ~30s from this test — report; consider marking the project CI-skipped only if the operator agrees.

## Maintenance notes

- This example doubles as the template for future transport examples (one directory, one adapter file, one node integration test).
- If SignalR gets a real example later, copy this structure; the base64-vs-MessagePack note in Step 4 is the first thing to test there.

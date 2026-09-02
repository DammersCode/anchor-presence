# PROGRESS — feature rollout (014 → 015 → 016)

> Working tracker for cross-session handoff. Update **Resume point** after every
> completed step. Commit this file with each plan commit so `git log -p --
> PROGRESS.md` replays the full trajectory.

**Last updated:** 2026-09-02 (plan 016 A DONE — auto-registration committed; plan 016 B1 next)
**Branch:** `dev` | **Drift base:** `1f8f7b4`

## Resume point

Next action: **plan 016, step B1 — `packages/core/src/inMemoryTransport.ts`**
(`createInMemoryPair`: a wire-connected 2-peer mesh. Each side implements
`LiveCursorTransport` (connect→connected, disconnect→disconnected, send,
subscribe, subscribeStatus replays, getStatus). `send` on A delivers to B's
subscribers only. Delivery is synchronous by default; `async?: boolean`
routes through `queueMicrotask`. `dispose()` stops delivery. DOM-free.)
Deliverable A (auto-registration) is DONE and committed: `autoRegister` flag
on `DomBindingOptions` (default off), `autoRegisterAttribute`, explicit-
register wins via a `WeakSet`, a separate MutationObserver (NOT the
scheduler's), `dispose()` cleanup, 9-case jsdom test suite green.
Plan 014 is DONE (7b97707), plan 015 is DONE (3cf3480), plan 016 A gate green
(vitest, tsc, vite build, oxlint 0 errors). Plan 016 drift check was clean:
only 014 additions in-scope (dom src/test).
Findings for the owner (out of plan scope, not touched):
`SPECIFICATION.md:140` and `playwright.config.ts:8` still reference the
deleted demo `WebSocketTransport`.

## Goal (owner, 2026-09-02)

Maximale Konfigurationsmöglichkeiten: Nutzer bringt seinen eigenen Transporter
mit (WebSocket/SignalR/Socket.IO/…), Library liefert die Live-Kommunikation
darauf. Dazu Nutzerfreundlichkeit (DX).

## Decisions (owner-approved, binding)

| Decision | Choice | Where |
|---|---|---|
| WS transport in library (`dom`) | WITH auto-reconnect, default `true`, `baseBackoffMs` 500 / `maxBackoffMs` 8000, `reconnect: false` switch | plan 014 |
| `usePresenceClient` | stable singleton, documented contract, NO dispose-on-unmount; explicit `dispose()` clears registry entry so the `key` can be re-created | plan 015 |
| `[data-anchor]` auto-registration | opt-in flag `autoRegister`, explicit `register` wins; separate MutationObserver (NOT the scheduler's geometry watcher) | plan 016 A |
| `createInMemoryPair` in `core` | DOM-free 2-peer mesh, sync delivery default, `async?: boolean` via microtask | plan 016 B |
| visibility-flush / touch sender | NOT planned separately — docs lines only (touch sending already works via pointermove; mobile viewing works) | backlog |

## Facts verified in code (2026-09-02)

- `LiveCursorTransport` (frozen): `packages/core/src/transport.ts` —
  `connect?/disconnect?/send/subscribe/subscribeStatus?/getStatus?`;
  `ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected"`.
- `PresenceClient` = one-way latch (`dispose()` final). `setStatus("connected")`
  in `client.ts` sets `pendingPublish = true` and re-publishes → auto
  re-transmit after reconnect (spec behavior; transports must not re-implement it).
- Demo WS transport (`apps/demo/src/cursors/transport.ts`): single `createWebSocketTransport`
  consumer is `apps/demo/src/cursors/setup.ts:4,50`
  (`createWebSocketTransport({ room: localRoom })`).
- Scheduler (`packages/dom/src/scheduler.ts`) already runs its own
  MutationObserver (`MutationObserverCtor` injection, options
  `childList/attributes/subtree`) for geometry invalidation — the 016-A
  observer must be a separate object reusing the same ctor injection.
- `AnchorRegistry` (`packages/dom/src/registry.ts`): `register` returns the
  unregister fn, dev-warns on re-register with a different element, `get`
  checks `isConnected`, `idByElement` WeakMap reverse index.
- Existing test projects in `vitest.config.ts`: core (node), dom (jsdom),
  react (jsdom), demo (node), socketio-example, signalr-example.
- Demo build: `cd apps/demo; bunx vite build` (same as CI:
  `working-directory: apps/demo`).
- tsconfig: `strict`, `exactOptionalPropertyTypes: true`,
  `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`.
- Lint: oxlint, `typescript/consistent-type-imports: error`,
  `no-explicit-any: error`, `no-floating-promises: error`; `apps/**` and
  `e2e/**` are lint-ignored.
- `packages/dom/src/index.ts` currently exports geometry/occlusion/registry/
  pointer/scheduler/resolver/binding — transport export goes after the
  scheduler block.
- `docs/transports.md` "Native WebSocket example" section = inline
  `class WebSocketTransport` (no reconnect, no `getStatus`,
  `subscribeStatus` WITHOUT replay) — replaced by library usage in step 4.
  The trailing "Reconnection and status" section already documents the
  status contract correctly; it stays.
- README.md lines mentioning transports: line 44 ("ready-made WebSocket,
  Socket.IO, SignalR, BroadcastChannel transports"), line 85, line 162
  ("bring your own WebSocket").
- `apps/demo` already depends on `@anchor-presence/dom workspace:*` — no
  package.json change needed for the demo switch.

## Environment / verify (repo memory)

- Root gate: `bunx vitest run` (all projects) +
  `bunx tsc --build packages/core packages/dom packages/react`.
- Playwright hangs under bun on this machine → run Playwright with `node`.
- Commits: plain English imperative, NO AI attribution trailer, on `dev`,
  no push unless asked.

## Step log

### Plan 014 — `createWebSocketTransport` in dom

- [x] Drift check clean; branch `dev`
- [x] Context read (demo consumer, doc sections, tsconfig, lint, README lines)
- [x] Step 1: `packages/dom/src/transport.ts` + export in `index.ts`
- [x] Step 2: `packages/dom/test/transport.test.ts` (FakeWebSocket, fake timers, 7 cases)
- [x] Step 3: demo → library transport (delete `apps/demo/src/cursors/transport.ts`, update `setup.ts`)
- [x] Step 4: `docs/transports.md` true-up (remove inline class)
- [x] Step 5: README/concepts line pass + `plans/README.md` row → DONE

Design notes for executor:
- Options: `url?` wins over computed default (`{ws|wss}://{host}:{port}{path}`);
  `host` default `window.location.hostname`, `port` 8787, `path`
  `/?room=<room>` (room from `options.room` else `?room=` param else "main");
  `reconnect`/`baseBackoffMs`/`maxBackoffMs` defaults true/500/8000;
  `WebSocketCtor` injectable (`type WebSocketCtor = new (url: string) => WebSocketLike`).
- `WebSocketLike` minimal structural type (readyState, on* handlers, binaryType,
  send, close) — do NOT structurally fight the real `WebSocket` lib type;
  keep it minimal so jsdom/tests satisfy it.
- Status machine (single source of truth in the transport file): initial
  `"connecting"` BEFORE `connect()` is called only if `connect()` was
  attempted; before any connect the status is `"disconnected"` (client's
  `getStatus` initial read then starts at "disconnected" → client shows
  connecting via its own default? NO — keep it simple: status starts `"connecting"` at construction, exactly like both existing implementations).
- `subscribeStatus` REPLAYS current status synchronously (fixes the docs bug);
  `getStatus` implemented.
- `close` handler: if `disposedByUser` → stay `disconnected`; else if
  `reconnect` on → `reconnecting` + backoff timer (delay `min(base * 2^attempt,
  max)`, attempt resets on open); else `disconnected`.
- `connect()` after `disconnect()`: no-op + `console.warn` in dev (copy the
  `isDevMode()` pattern from `packages/core/src/client.ts`).
- `binaryType = "arraybuffer"` set per opened socket.
- `send` drops when not `readyState === 1` (use the numeric constant or
  `WebSocket.OPEN` if available on the ctor; keep it simple: compare to 1 with
  a small `WS_OPEN` const to avoid depending on globals in tests).

### Plan 015 — `usePresenceClient` + `useRemoteUsers`

- [x] Step 1: `useRemoteUsers` (pure projection, identity-stable cache)
- [x] Step 2: `usePresenceClient` (module `Map` registry by `key`, wrapper
      whose `dispose()` clears the entry then delegates)
- [x] Step 3: tests (`remoteUsers.test.tsx`, `presenceClient.test.tsx`)
- [x] Step 4: README sections + optional demo `WhoIsOnline` chip

Types to ship (final):
```ts
type RemoteUser<TUser = unknown> = { clientId: string; user: TUser | undefined; session: string };
function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TUser>[];
type PresenceClientFactoryOptions<TContext, TUser> = {
  factory: (opts: { key?: string }) => PresenceClient<TContext, TUser>;
  key?: string;
};
function usePresenceClient<TContext = unknown, TUser = unknown>(o: PresenceClientFactoryOptions<TContext, TUser>): PresenceClient<TContext, TUser>;
```
NOTE: the wrapper returned by `usePresenceClient` must typecheck as
`PresenceClient<TContext, TUser>` — build it via object-spread of the real
client + overridden `dispose`. Verify tsc passes.

### Plan 016 A — `[data-anchor]` auto-registration

- [x] Step A1: `packages/dom/src/autoRegister.ts` (scan + diff via `sync()`,
      `Map<Element, { id, unregister }>`, `explicit` WeakSet skip, `resync()`
      for the explicit-unregister take-back, separate MutationObserver)
- [x] Step A2: wire into `createDomBinding` (`DomBindingOptions.autoRegister`,
      `autoRegisterAttribute`, default off; `WeakSet` explicit; wrap the
      registry's `register`/unregister for marking)
- [x] Step A3: `packages/dom/test/autoRegister.test.ts` (9 cases)
- [x] Step A4: `packages/dom/README.md` + root README matrix row

A design note (why the wrapped register marks + `resync()` BEFORE
`realRegistry.register`): releasing the auto anchor first prevents the auto
unregister fn from deleting a same-id explicit entry. Collision (two elements,
same value): last-wins in the registry, the loser stays dormant (no churn/loop).

### Plan 016 B — `createInMemoryPair` in core

- [ ] Step B1: `packages/core/src/inMemoryTransport.ts` + index export
- [ ] Step B2: `packages/core/test/inMemoryTransport.test.ts` (node env, 5 cases)
- [ ] Step B3: `docs/transports.md` "Testing without a browser" section

## Full gate checklist (run after each plan, and at the end)

```
bunx vitest run
bunx tsc --build packages/core packages/dom packages/react
cd apps/demo; bunx vite build
git -C "c:\repos\danny\anchor presence" diff --stat  # review before commit
```

## Commit plan (no push)

1. `add createWebSocketTransport to @anchor-presence/dom` (014: src, test,
   index export, demo switch, docs)
2. `add usePresenceClient and useRemoteUsers react hooks` (015)
3. `add [data-anchor] auto-registration to dom binding` (016 A)
4. `add createInMemoryPair test transport to core` (016 B)
5. `update plans status` (plans/README.md rows DONE, PROGRESS.md final state)

# Plan 014: Ship a native `createWebSocketTransport` in `@anchor-presence/dom`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before the next step. If a STOP condition occurs, stop
> and report. Do not improvise. When the work is complete, update this plan row
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 1f8f7b4..HEAD -- packages/dom docs/transports.md apps/demo/src/cursors packages/dom/src/index.ts`
> If an in-scope file changed, compare the live file with the excerpts below.
> If a relevant API or test contract changed, stop and report.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW (new public API, no existing surface changes)
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: api
- **Planned at**: commit `1f8f7b4`, 2026-09-02

## Why this matters

The repo goal is maximum configurability: the user brings their own transport
(WebSocket, SignalR, Socket.IO, or anything else) and the library provides the
live communication on top of it. The `LiveCursorTransport` interface makes that
possible, but the native-WebSocket path — the most common case — still pushes
~40 lines of copy-paste at every new user. The code exists twice today:

- `docs/transports.md` "Native WebSocket example": no reconnect, no backoff,
  `subscribeStatus` does not replay the current status on subscribe (it adds
  the listener and returns; the client then starts at `"connecting"` and
  re-publishes only after the next status change — with `getStatus` missing
  from the docs version, a late client sees the connection but the docs
  example omits `getStatus` entirely).
- `apps/demo/src/cursors/transport.ts`: full backoff reconnect
  (`baseBackoffMs`, `maxBackoffMs`), but explicitly demo code marked
  "not part of @anchor-presence/core".

One library function removes the friction and makes the docs a pointer to a
tested artifact instead of an untested inline class. Native `WebSocket` only
needs the browser global — `dom` is the only browser-allowed package, so it
belongs there (Invariant 6 keeps `core` DOM-free).

## Current state

- `packages/core/src/transport.ts` (frozen contract, quote):

```ts
export interface LiveCursorTransport {
  connect?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
  send(data: Uint8Array): Promise<void> | void;
  subscribe(listener: (data: Uint8Array) => void): () => void;
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
  getStatus?(): ConnectionStatus;
}
```

- `packages/dom/src/binding.ts:30-46` — `DomBindingOptions` / `EnvironmentOptions`
  pattern to copy: every host takes a ctor or the ambient global
  (`options.MutationObserverCtor ?? win.MutationObserver`).
- `packages/dom/src/index.ts` exports the scheduler types and binding API;
  it is the only surface a demo imports from `dom`.
- `apps/demo/src/cursors/transport.ts` — the reference implementation with
  backoff; its `disconnect()` sets `disposed = true` and never allows a
  second `connect()` (one-shot); `error → ws.close()` funnels into the
  `close` handler; `send` drops frames that are not `OPEN` (lossy by design).
- `apps/demo/src/cursors/setup.ts` builds the client once at module level and
  calls `transport.connect?.()` after `createPresenceClient`.
- `docs/transports.md` — four sections: interface + rules, native WebSocket
  (inline `class WebSocketTransport`), Socket.IO (pointers to the tested
  `examples/socketio`), SignalR (sketch, untested, explicitly labeled).
- `docs/concepts.md` / README capability matrix — check for mentions of the
  demo transport and update in Step 5.

## Required public API

Create `packages/dom/src/transport.ts` and export from `index.ts`:

```ts
export { createWebSocketTransport };
export type { WebSocketTransportOptions };
```

Shape:

```ts
type WebSocketTransportOptions = {
  /** WebSocket URL. Defaults to `ws(s)://<current host>:<relayPort>/<room path>` when omitted. */
  url?: string;
  /** Defaults to `window.location.host` (current origin). */
  host?: string;
  /** Path including query; defaults to `/?room=<room>` where room comes from
   *  `options.room` or the page's `?room=` param, else "main". */
  path?: string;
  /** Room used when building the default URL / `path`. */
  room?: string;
  /** Relay port used when building the default URL. Defaults to 8787. */
  port?: number;
  /** Enable automatic reconnect with exponential backoff. Default `true`. */
  reconnect?: boolean;
  /** Base backoff in ms before the first attempt. Default 500. */
  baseBackoffMs?: number;
  /** Cap on the backoff. Default 8000. */
  maxBackoffMs?: number;
  /** Inject a WebSocket constructor; defaults to `globalThis.WebSocket`. */
  WebSocketCtor?: WebSocketCtor;
};

type WebSocketCtor = new (url: string) => WebSocketLike;

type WebSocketLike = {
  readonly readyState: number; // 1 = OPEN
  readonly onopen: null | (() => void);
  readonly onclose: null | (() => void);
  readonly onerror: null | (() => void);
  readonly onmessage: null | ((event: { data: unknown }) => void);
  binaryType: string;
  send(data: ArrayBufferView): void;
  close(): void;
};
```

Behavior contract (unit-tested):

1. `connect()` opens the socket, sets `binaryType = "arraybuffer"`, maps
   `open→connected`, `close→disconnected or reconnecting` (only when
   `reconnect: true` AND the close was not triggered by `disconnect()`).
2. `subscribeStatus` replays the current status to the subscriber immediately
   (docs invariant: "SHOULD replay"; the client also needs `getStatus` to
   start with the right status — both are provided).
3. `send` drops payload when the socket is not `OPEN` (presence is lossy).
4. Status transitions on connect: `connecting → connected`; on drop with
   reconnect on: `connected → reconnecting → connected` per attempt;
   `disconnect()` always ends in `disconnected` and cancels the pending
   reconnect timer.
5. Two `send` calls before `connect()` are dropped silently (no throw).
6. Reopening after `disconnect()` is NOT supported (one-shot, same as the
   demo implementation) — disposing the transport and creating a new one is
   the documented way to "come back later".

## Scope

**In scope**:
- `packages/dom/src/transport.ts` (new), `packages/dom/src/index.ts` (one
  extra export block), `packages/dom/test/transport.test.ts` (new).
- `docs/transports.md`: replace the inline `class WebSocketTransport` with a
  short usage example + pointer to the library function; keep the interface
  section untouched.
- `apps/demo/src/cursors/transport.ts` + `setup.ts` + `CursorLayer` callers:
  replace the demo implementation with the library one (demo becomes the
  reference consumer). Delete the demo file if `setup.ts` no longer needs any
  demo-specific helpers.
- README / `docs/concepts.md` capability line: "native WebSocket transport
  ships in `@anchor-presence/dom`" (only if the matrix mentions transports).

**Out of scope**: `packages/core` (transport interface stays frozen),
`examples/*` (Socket.IO/SignalR adapters stay in their own folders),
auth/reconnect beyond the documented backoff (per repo decision:
reconnect/backoff helpers are user-land — the library's default backoff is a
convenience, not a framework).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | `bun install` | exit 0 |
| DOM unit tests | `bunx vitest run --project dom` | pass |
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | green |
| Full gate | `bunx vitest run` | all projects green, clean exit |
| Demo builds | `cd apps/demo; bunx vite build` (same as CI) | success |

## Steps

### Step 1 — Implement `packages/dom/src/transport.ts`

Copy the reconnect/backoff state machine from
`apps/demo/src/cursors/transport.ts` as the behavioral baseline, and apply
these deliberate changes over the demo version:

- Accept `WebSocketTransportOptions` as designed above; the `url` option wins
  over the computed default. The computed default is
  `` `${protocol}//${host}:${port}${path}` `` with
  `protocol = ws:` or `wss:` from `window.location.protocol`.
- Default `reconnect: true`, `baseBackoffMs: 500`, `maxBackoffMs: 8000`.
- Add `getStatus` (missing in both today's implementations): return the
  current status; the client reads it once at creation.
- Make the ctor injectable via `WebSocketCtor` (mirrors the
  `EnvironmentOptions.MutationObserverCtor` pattern) — this is what makes the
  unit tests deterministic under jsdom without a real socket.
- `subscribeStatus` replays the current status synchronously on subscribe
  (both demo and docs versions skip the replay — fix it here).
- `disconnect()` cancels the pending timer, closes the socket, transitions to
  `disconnected`.
- Keep the single-shot semantics: `connect()` after `disconnect()` is a
  documented no-op with a dev-warning (use `console.warn` behind the same
  `isDev()` style the core client uses — check `packages/core/src/client.ts`
  `isDevMode` for the pattern).
- `send` must not throw; swallow like the client does (lossy design).
- `binaryType = "arraybuffer"` at every `open()`, not once at connect — a
  re-opened socket is a different `WebSocket` object.

Export from `packages/dom/src/index.ts` right after the scheduler exports.

**Verify**: `bunx tsc --build packages/dom` green; `bunx vitest run --project dom`
still green (no existing test broken).

### Step 2 — Unit tests `packages/dom/test/transport.test.ts`

jsdom does not have a real `WebSocket`; the test provides a
`class FakeWebSocket implements WebSocketLike` with:

- static `instances: FakeWebSocket[]` and static `fire(instance, "open" |
  "close" | "error" | "message", payload?)` helpers;
- a `send` spy recording `Uint8Array` payloads.

Cover at minimum:

1. Status starts `connecting` before `connect()`, `connected` after `open`,
   `disconnected` after `close` with `reconnect: false`.
2. Backoff: `connect` → `close` → expect `reconnecting` after the close and a
   new socket instance after `vi.advanceTimersByTime(baseBackoffMs)`; a
   second `close` doubles the delay (2 × base); the delay is capped at
   `maxBackoffMs`. Use `vi.useFakeTimers()`.
3. `disconnect()` inside the backoff window cancels the timer: advance to
   the scheduled time, assert no new socket instance was created.
4. `subscribeStatus` replay: a late subscriber sees the current status
   synchronously.
5. `send` before `open` does not throw and records nothing; `send` while
   `OPEN` records the exact `Uint8Array` bytes.
6. `getStatus` matches `subscribeStatus` across the full
   `connecting → connected → reconnecting → connected` cycle.
7. Reopen after `disconnect()` is a no-op (dev-warning branch — spy
   `console.warn`).

**Verify**: `bunx vitest run --project dom` green, new suite visible in the
output.

### Step 3 — Demo now consumes the library transport

- `apps/demo/src/cursors/transport.ts`: replace the body with a thin re-export
  or delete the file and update `setup.ts` to
  `import { createWebSocketTransport } from "@anchor-presence/dom"`.
- Keep the demo's `port`/`room` defaults (8787, `?room=` param) by passing
  them as options — the library defaults already match, so the call site
  collapses to `createWebSocketTransport({ room: localRoom })`.
- If the demo file becomes an empty re-export after this, delete it and
  point `apps/demo/src/cursors/setup.ts` at the library directly.

**Verify**: `bunx vite build` for the demo succeeds; `bunx vitest run` all
green; manually: `bun dev` demo in two windows — cursors sync, killing the
relay and restarting it reconnects within ~1s (first backoff step).

### Step 4 — Docs truth pass

In `docs/transports.md`, the "Native WebSocket example" section becomes:

- a 3-line usage block: `createWebSocketTransport({ room })` +
  `transport.connect()` + `createPresenceClient({ transport })`;
- a one-paragraph note that the Socket.IO and SignalR paths stay in
  `examples/*` (they need foreign dependencies; only the native transport is
  part of the library — this is the recorded owner decision from
  `TODO-evaluation-2026-09-02.md` row 8);
- remove the inline `class WebSocketTransport` (its options and reconnect
  semantics are now the library's contract).

STE style rules from plan 008 apply: sentences ≤ 20/25 words, imperative
procedures, no "should", "for example" not "e.g.".

**Verify**: `grep -c "class WebSocketTransport" docs/transports.md` → 0;
`grep -n "createWebSocketTransport" docs/transports.md` ≥ 1.

### Step 5 — Capability matrix + plan row

- Update the README docs and `docs/concepts.md` wherever the transport matrix
  lists "WebSocket (in demo)" to "WebSocket (library, `dom`)".
- Add the plan row to `plans/README.md` (status DONE, link here).

**Verify**: `grep -rn "demo.*WebSocket\|WebSocket.*demo" README.md docs/ -i`
shows no stale claims.

## Done criteria

- [ ] `createWebSocketTransport` exported from `@anchor-presence/dom` and covered by the Step 2 suite
- [ ] Demo uses the library transport; the demo-local implementation is deleted or a thin alias
- [ ] `docs/transports.md` points at the library function; no inline class remains
- [ ] `bunx vitest run` all projects green; `bunx tsc --build …` green; demo `vite build` succeeds
- [ ] `plans/README.md` row updated

## STOP conditions

- The `LiveCursorTransport` interface cannot express the backoff/reconnect
  state machine without adding a member — report as an architecture finding;
  do not patch the interface.
- A unit test needs a real network socket (i.e. the `WebSocketCtor` injection
  point is not enough) — report; do not add a network fake library.
- Step 3 breaks the demo's two-window manual check (cursors stop syncing, or
  the relay-restart reconnect takes >5s) — do not force it through; capture
  the behavior and report.

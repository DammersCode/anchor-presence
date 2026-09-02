# Plan 015: Add `usePresenceClient` and `useRemoteUsers` to `@anchor-presence/react`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before the next step. If a STOP condition occurs, stop
> and report. Do not improvise. When the work is complete, update this plan row
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 1f8f7b4..HEAD -- packages/react packages/core/src/client.ts apps/demo/src/cursors`
> If an in-scope file changed, compare the live file with the excerpts below.
> If a relevant API or test contract changed, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (lifecycle semantics under StrictMode; new public React API)
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: api
- **Planned at**: commit `1f8f7b4`, 2026-09-02

## Why this matters

The React goal is "bring your own transport, render presence with minimal
ceremony". Today the user must create the `PresenceClient` outside React
(module-level singleton per client, exactly like
`apps/demo/src/cursors/setup.ts`) and pass it to `LiveCursorProvider`. That
pattern works but is (a) not documented as the standard pattern in the
package README, and (b) error-prone: `PresenceClient` is a one-way latch —
`dispose()` is final and the client cannot be recreated — so a naive
`useEffect(() => { const c = createPresenceClient(…); return () => c.dispose(); }, …)`
breaks under StrictMode's double-mount: the second mount gets a dead client.

Two small, well-scoped API additions close the DX gap:

1. `usePresenceClient({ factory })` — a React-safe accessor that owns the
   client's identity across StrictMode remounts. The owner decision (recorded
   2026-09-02): **the hook keeps a stable singleton; documented contract.**
   It does NOT dispose on unmount; disposal stays an explicit act.
2. `useRemoteUsers()` — the "N people online" bar. Derived from the existing
   `useCursorPresence` snapshot; deduplicated by `clientId`; independent of
   cursor position. ~15 lines of derivation, no new state.

## Current state

- `packages/core/src/client.ts:35-60` — `PresenceClient` interface:
  `dispose(): void` has no re-use semantics; `registerTeardown(fn)` runs `fn`
  immediately once the client is disposed.
- `packages/core/src/client.ts` — `createPresenceClient(options)` returns a
  fresh client per call; no registry, no idempotency built in.
- `packages/react/src/hooks.ts` — existing hooks all read through
  `useLiveCursorContext()` and are SSR-safe (server snapshot functions
  `getServerCursors`, `getServerPresence`, `getServerStatus`). New hooks
  follow the same shape.
- `packages/react/src/provider.tsx` — `LiveCursorProvider` accepts a
  `client` prop; if `binding` is not provided it creates one via
  `createDomBinding(client, bindingOptionsRef.current)` in a `useEffect` and
  disposes it on cleanup. The provider itself does NOT dispose the client.
- `apps/demo/src/cursors/setup.ts` — module-level singleton:
  `getPresenceClient()` guards with `if (client !== null) return client;` and
  comments "Module-safe: constructs the transport/client lazily so importing
  this module never touches the network at eval time." This is the contract
  `usePresenceClient` formalizes.
- `packages/react/test/` — existing hooks tests (`cursor.test.tsx`,
  `rerenderIsolation.test.tsx`, `perf.test.tsx`) use `TestingLibrary` +
  `act()`; follow their fixture style (jsdom project in `vitest.config.ts`).
- `useCursorPresence` (`hooks.ts:105-117`) already returns
  `CursorPresence[]` via `useSyncExternalStore`; `useRemoteUsers` composes it.

## Required public API

Add to `packages/react/src/hooks.ts` and re-export from `index.ts`:

```ts
export { usePresenceClient, useRemoteUsers };
export type { PresenceClientFactoryOptions, RemoteUser };
```

### `usePresenceClient`

```ts
type PresenceClientFactoryOptions<TContext, TUser> = {
  /**
   * Creates the client exactly once per factory identity. The result is
   * memoized for the lifetime of the page. Pass a `useRef`-stable or
   * module-scoped factory; the hook does not deep-compare it.
   */
  factory: (opts: { key?: string }) => PresenceClient<TContext, TUser>;
  /**
   * Optional identity for multi-client setups. The same `key` on the same
   * hook mount resolves to the same client instance across StrictMode
   * remounts. Defaults to a single implicit instance.
   */
  key?: string;
};

function usePresenceClient<TContext = unknown, TUser = unknown>(
  options: PresenceClientFactoryOptions<TContext, TUser>,
): PresenceClient<TContext, TUser>;
```

Semantics (unit-tested):

1. **Memoization**: the factory runs once per `(key)` per page; subsequent
   renders and StrictMode double-mounts return the same instance.
2. **No dispose on unmount** (owner decision): the client outlives any
   component. `PresenceClient` is not re-creatable after `dispose()`, and
   remounts during a page session (route changes, StrictMode) must keep
   working. Disposal is explicit:
   `client.dispose()` called by the user (e.g. on logout / tab teardown), and
   `LiveCursorProvider`'s binding cleanup already reacts to a disposed client
   via `client.registerTeardown`.
3. **`connect` is the user's job**: the hook does NOT call `transport.connect()`.
   The factory owns the transport and its lifecycle; the hook only owns the
   memoized client identity. Documented in the hook's JSDoc with the demo
   call shape:

   ```ts
   const client = usePresenceClient({
     factory: () => createPresenceClient({ transport }), // transport already .connect()'d or connect inside factory
   });
   ```

   (The two common shapes: `connect()` inside the factory right after
   construction — recommended; or before rendering, from a page bootstrap.)
4. **Multi-instance**: pass different `key`s for separate client
   instances (rare; e.g. an admin overlay + the main canvas), or omit `key`
   for the single common case.
5. **SSR**: under SSR the factory still runs once on first server render;
   that is the documented tradeoff (client is browser-oriented by design) —
   the hook returns it and the provider renders an empty binding server-side
   (the existing `isBrowser()` guard in `provider.tsx` already handles this).

### `useRemoteUsers`

```ts
type RemoteUser<TUser = unknown> = {
  clientId: string;
  user: TUser | undefined;
  lastSeen: CursorPresence<TUser>["presence"] extends never ? never : CursorPresence<TUser>;
};

function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TContext, TUser>[];
```

Simpler and sufficient (use this, not the above trickery):

```ts
type RemoteUser<TUser = unknown> = {
  clientId: string;
  user: TUser | undefined;
  session: string;
};

function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TUser>[];
```

Semantics:

1. Composed from `useCursorPresence<TContext, TUser>()`; mapped to
   `{ clientId, user: p.user, session: p.session }` per entry.
2. Deduplicated by `clientId` (`last wins` = the store already keeps one
   entry per clientId, so `useCursorPresence` is already unique — the hook
   is a pure shape projection, no dedup code needed; the "deduplicated"
   claim in the TODO list refers to the store's behavior).
3. Re-renders only when the client's `subscribeRemote` snapshot changes
   (same `useSyncExternalStore` machinery, no extra timers).
4. SSR-safe: server snapshot returns `[]` (matches the existing pattern).

## Scope

**In scope**:
- `packages/react/src/hooks.ts` (two new hooks + types), `index.ts` (exports).
- `packages/react/test/presenceClient.test.tsx` and
  `packages/react/test/remoteUsers.test.tsx` (new).
- `packages/react/README.md` — "Client lifecycle" section (the singleton
  contract, when to call `dispose()`, StrictMode note) and a "Who's online"
  section showing `useRemoteUsers` for the avatar bar.
- `apps/demo/src/App.tsx` or a small `WhoIsOnline` component — wire
  `useRemoteUsers` into a visible "N online" chip so the demo shows it
  (optional, but cheap and proves SSR-safety via the existing
  `isBrowser()` guard).

**Out of scope**:
- `PresenceClient` re-usability after dispose (one-way latch is a recorded
  core decision; reworking it changes the wire protocol's session/sequence
  model — a future separate plan).
- Auto-dispose on `beforeunload` / tab teardown (keep the user in control;
  the stale sweep in `RemotePresenceStore` handles the other end).
- A `usePresenceProvider` that merges provider + hook (provider composition
  stays explicit).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | `bun install` | exit 0 |
| React unit tests | `bunx vitest run --project react` | pass |
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | green |
| Full gate | `bunx vitest run` | all projects green, clean exit |

## Steps

### Step 1 — `useRemoteUsers`

Implement in `hooks.ts` after `useCursorPresence`. Pure projection of the
existing `useSyncExternalStore` result; no new state, no timers.

```ts
const EmptyUsers: RemoteUser[] = [];
function getServerUsers(): RemoteUser[] { return EmptyUsers; }

function useRemoteUsers<TContext = unknown, TUser = unknown>(): RemoteUser<TUser>[] {
  const presence = useCursorPresence<TContext, TUser>();
  // derive via useSyncExternalStore on the same underlying client for stable identity
  const { client } = useLiveCursorContext<TContext, TUser>();
  const subscribe = /* subscribe to client.subscribeRemote, same as useCursorPresence */;
  const getSnapshot = () => /* project client.getRemoteSnapshot() to RemoteUser[] */;
  return useSyncExternalStore(subscribe, getSnapshot, getServerUsers);
}
```

Keep the projection cheap: allocate a new array only when the client's
snapshot identity changes (copy the `useRemoteCursorsSelector` identity
pattern: cache last projection in a ref and return the same reference when
`isEqual`).

**Verify**: `bunx vitest run --project react` green;
`bunx tsc --build packages/react` green.

### Step 2 — `usePresenceClient`

Implement with a module-level `Map<string, PresenceClient>` keyed by the
`key` (default `"__default__"`). The map lives at module scope so it
survives StrictMode unmounts within the page session.

```ts
const clientRegistry = new Map<string, PresenceClient>();

function usePresenceClient<TContext = unknown, TUser = unknown>({ factory, key = "__default__" }: PresenceClientFactoryOptions<TContext, TUser>): PresenceClient<TContext, TUser> {
  // stabilize the factory reference across renders
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  const client = clientRegistry.get(key) ?? (clientRegistry.set(key, factoryRef.current({ key })), clientRegistry.get(key)!);
  return client as PresenceClient<TContext, TUser>;
}
```

Notes:

- `factoryRef` is reassigned every render (cheap ref write, standard hook
  pattern) so the factory can close over changing props without forcing
  a re-memoization — the client is still created with the FIRST render's
  closure. Document this in the JSDoc.
- NO `useEffect` for dispose. The registry never evicts on unmount. On full
  page unload the GC reclaims. The only way to clear an entry is an explicit
  `client.dispose()` followed by a fresh `usePresenceClient` with the same
  `key` → the user re-creating; to make that work, after `dispose()` the
  registry entry should be cleared so the next factory call can re-create.
  Since the client is a one-way latch, `dispose()` invalidates the entry:
  have the hook wrap the returned client in a `Proxy` or a small wrapper
  whose `dispose()` first clears `clientRegistry` then delegates. Keep it
  simple: `usePresenceClient` returns a wrapper object that forwards all
  members and overrides `dispose()` to also delete the registry entry.

**Verify**: `bunx vitest run --project react` green; tsc green.

### Step 3 — Tests

`packages/react/test/remoteUsers.test.tsx`:

- Given a `PresenceClient` fixture with two remotes (`user` set on one,
  unset on the other), render a component calling `useRemoteUsers`; expect
  exactly two entries, `clientId`/`session`/`user` fields correct, the
  undefined-user entry has `user === undefined`.
- A third remote ingested in a test step via a `client.updateLocalCursor` +
  the fake transport round-trip (reuse the existing demo test transport
  pattern) appears without a component re-render being forced manually —
  `act()` flushes the notify.
- SSR snapshot: render the hook outside the provider → `[]`.

`packages/react/test/presenceClient.test.tsx`:

- Two consecutive `render()` calls of a component using
  `usePresenceClient` with the same `key` → factory called exactly once;
  same instance identity.
- StrictMode: `render(<StrictMode><Comp/></StrictMode>)` → factory called
  once (use `vi.spyOn(factory)`), same instance after the double-mount.
- Two components, same hook, no `key` → same instance.
- Same hook, different `key` → two distinct instances.
- Explicit `dispose()` via the wrapper → registry entry cleared; a
  subsequent `render()` of the same component factory-ran again (fresh
  instance) — this is the "re-create after dispose" contract.
- SSR: hook outside the provider returns a working client (factory ran once
  on the server module eval — assert identity is stable across renders).

**Verify**: `bunx vitest run --project react` — both new suites visible and
green.

### Step 4 — README + demo

- `packages/react/README.md` → "Client lifecycle": show `usePresenceClient`
  with the demo's `createPresenceClient` factory; state the one-way-latch
  rule and that `dispose()` is the only way to reset a `key`; note the
  module-scope tradeoff (clients live for the page session).
- "Who's online" section: a 5-line example
  (`const users = useRemoteUsers(); <span>{users.length} online</span>`)
  and a note that `user` is the `TUser` passed to `createPresenceClient` —
  the library does not derive labels/colors from `clientId` (owner row 10).
- Optional demo chip: a small `WhoIsOnline` component in
  `apps/demo/src/components/` rendered from `App.tsx`, using
  `useRemoteUsers` + the existing `CURSOR_PALETTE`/`isKnownCursorColor` to
  color dots. Keep it under 40 lines; no new dependencies.

**Verify**: `bunx tsc --build …` green; `cd apps/demo; bunx vite build`
succeeds; README example typechecks (copy-paste the README snippet into a
throwaway test file and tsc it, then delete).

## Done criteria

- [ ] `usePresenceClient` and `useRemoteUsers` exported from `@anchor-presence/react`
- [ ] StrictMode test proves the factory runs once (the core risk of this plan)
- [ ] README gains the "Client lifecycle" + "Who's online" sections
- [ ] `bunx vitest run` + `bunx tsc --build …` green; demo builds
- [ ] `plans/README.md` row updated

## STOP conditions

- Making `PresenceClient.dispose()` non-latched turns out to be required for
  the StrictMode tests to pass — STOP and report; the plan's premise is the
  wrapper + explicit-dispose contract, and a protocol change is a separate
  plan.
- `usePresenceClient` under SSR causes side effects (the factory touches the
  network at module-eval time in a test or in the demo's SSR path) — STOP;
  the tradeoff must be documented and the demo's SSR must remain clean (the
  demo is currently client-rendered; if a next.js-style SSR path appears,
  re-think before shipping).
- The `useRemoteUsers` derivation triggers more re-renders than
  `useCursorPresence` alone (a perf test in `perf.test.tsx` regresses) —
  STOP; the projection must not add a render trigger.

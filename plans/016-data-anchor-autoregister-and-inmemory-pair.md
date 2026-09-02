# Plan 016: Add `[data-anchor]` auto-registration and a core `createInMemoryPair()` transport

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before the next step. If a STOP condition occurs, stop
> and report. Do not improvise. When the work is complete, update this plan row
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 1f8f7b4..HEAD -- packages/dom/src packages/core/src packages/dom/test packages/core/test`
> If an in-scope file changed, compare the live file with the excerpts below.
> If a relevant API or test contract changed, stop and report.

## Status

- **Priority**: P1 (auto-registration) / P2 (in-memory pair)
- **Effort**: L
- **Risk**: MED (auto-registration touches the DOM-mutation path; collisions and removal semantics are the hard part)
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: api
- **Planned at**: commit `1f8f7b4`, 2026-09-02

This plan ships two independent, independently-mergeable deliverables:

1. **Deliverable A — `[data-anchor]` auto-registration** in `dom`. Best DX
   for React and Vanilla: drop a `data-anchor="foo"` attribute on an element
   and it becomes a presence anchor with no explicit `register` ref.
2. **Deliverable B — `createInMemoryPair()`** in `core`. A wire-connected
   transport pair for user unit tests that run without a browser or a relay.

They are in one plan only because they were one TODO row; execute A before B
because A is the higher-value item and touches the riskier code. Merge them
as two separate commits / PRs.

## Why this matters

Goal: user-friendly, maximally configurable. Today every anchor needs a
manual ref + `useCursorAnchor(id)(ref)` (React) or
`binding.registry.register(id, element)` (vanilla). That is a real tax when a
page has many anchors. Auto-registration removes the manual refs: the
attribute itself is the registration. The in-memory pair closes the gap for
consumer unit tests — `@anchor-presence/core` is DOM-free and its
`createPresenceClient` is fully usable in node, but today a consumer's own
test needs either a real socket or a hand-rolled fake; a one-line
wire-connected pair makes "feed A, read B" trivial and is a common ask for a
library that encourages BYO-transport.

## Current state

- `packages/dom/src/registry.ts` — `createAnchorRegistry()`:
  - `register(id, element)` returns an unregister fn; a re-register with a
    different element for the same `id` keeps the new element and
    `console.warn`s in dev; the `idByElement` WeakMap is the reverse index.
  - `get(id)` returns `null` if the element is no longer `isConnected`.
  - `ancestors(element)` walks up through shadow roots collecting `[id, element]`
    innermost-first (already used by `pointer.ts` for the sent anchor chain).
  - `onChange(listener)` notifies on every register/unregister (the scheduler
    subscribes to this for invalidation).
- `packages/dom/src/binding.ts` — `createDomBinding(client, options)` builds
  the registry, resolver, scheduler, and pointer source; `DomBindingOptions`
  carries `maxAnchors`, `resolution`, and `environment`. This is where
  Deliverable A's opt-in flag and its observer hook in.
- `packages/dom/src/scheduler.ts` — the geometry scheduler ALREADY runs a
  `MutationObserver` (with `MutationObserverCtor` injection and the watch
  options `childList, attributes, subtree`). That observer is for
  *invalidating cached geometry*, not for anchor registration. Deliverable A
  must NOT reuse that observer's callback; it is a separate concern. Reuse
  the same `MutationObserverCtor` injection point so tests can stub it.
- `packages/dom/src/pointer.ts` — `attachPointerSource(client, registry, …)`
  reads `registry.ancestors(target)` to build the outbound cursor. It is
  agnostic to HOW the registry was populated, so manual and auto-registered
  anchors both work unchanged.
- `packages/core/src/transport.ts` — the frozen `LiveCursorTransport`
  interface. Deliverable B implements this with an in-memory pipe.
- `packages/core/src/codec.ts` + `validate.ts` — `createPresenceClient`
  decodes+validates inbound. For the pair, each side's `send` feeds the other
  side's `subscribe`, and the client does the real decode/validate. Keep the
  pair a thin pipe (encode/decode happens in the client, not the transport),
  which exactly matches how `send`/`subscribe` are specified (already-encoded
  bytes on the wire).
- No `InMemory` transport exists anywhere in `packages/*`.

## Required public API

### Deliverable A — auto-registration

Extend `DomBindingOptions` (in `packages/dom/src/binding.ts`):

```ts
type DomBindingOptions<TContext, TUser> = {
  maxAnchors?: number;
  resolution?: ResolutionOptions<TContext, TUser>;
  environment?: EnvironmentOptions;
  /** Watch the DOM for [data-anchor] elements and register/unregister them
   *  automatically. Default false (opt-in, to avoid surprising side effects
   *  and to keep the current explicit-register path the source of truth). */
  autoRegister?: boolean;
  /** Attribute name to watch. Default "data-anchor". */
  autoRegisterAttribute?: string;
};
```

Behavior contract (unit-tested in jsdom):

1. **Opt-in only**: with `autoRegister` unset/false, behavior is byte-for-byte
   identical to today (no observer for registration runs). Gate the new
   observer on the flag.
2. **Scan on start**: when the binding is created with `autoRegister: true`,
   walk `environment.root` (default `document`) for `elementsWithAttribute`
   and register each. Id resolution:
   - attribute value non-empty → use it as the `id`;
   - attribute present but empty (`data-anchor`) → fall back to `element.id`,
     else a generated id (`"auto-" + <n>` using a counter) and `console.warn`
     once in dev.
3. **Live watch**: a `MutationObserver` (injected `MutationObserverCtor`,
   default ambient) watches `childList` + `attributes` (the target
   attribute) + `subtree`:
   - element added with the attribute → register;
   - the attribute added to an existing element → register;
   - the attribute removed or value changed → unregister the old, register the
     new (a value change is a different anchor);
   - element removed from the tree → unregister.
4. **Explicit registration wins** (owner TODO: "Präzedenz — explizite
   `register` gewinnt"): maintain a `WeakSet` of explicitly-registered
   elements. An explicit `register(id, el)` (through the registry) marks `el`;
   the auto-observer must NOT create or clobber an anchor for an element that
   is explicitly registered, and an explicit re-register always wins over an
   auto one for the same element. Unregistering the explicit binding removes
   the mark, after which the auto-observer may take it back if the attribute
   is present.
5. **Collision safety**: two different elements with the same `data-anchor`
   value → the registry's existing dev-warning fires (new element wins), no
   crash; auto-registration must not bypass the registry's collision handling.
6. **Cleanup**: `binding.dispose()` disconnects the auto-observer and
   unregisters every auto-registered anchor (so the final empty snapshot
   stays correct). Explicit anchors are untouched (they own their own
   unregister).
7. **Idempotent across remounts**: creating+disposing a binding twice does not
   leak observers or leave auto-anchors registered.

Export the flag through the existing `createDomBinding`; no new top-level
export is required (the flag lives on `DomBindingOptions`, which is already
exported).

### Deliverable B — in-memory pair

Create `packages/core/src/inMemoryTransport.ts`, export from `index.ts`:

```ts
export { createInMemoryPair };
export type { InMemoryPair };
```

Shape:

```ts
type InMemoryPair = {
  /** Feed it to client A (send goes A → B). */
  a: LiveCursorTransport;
  /** Feed it to client B (send goes B → A). */
  b: LiveCursorTransport;
  /** Tear down both sides and stop delivery. */
  dispose(): void;
};
```

Semantics:

1. Each side implements `LiveCursorTransport` with `connect` (resolves to
   `connected`), `disconnect` (to `disconnected`), `send`, `subscribe`,
   `subscribeStatus` (replays current status), `getStatus`.
2. `send(bytes)` on A is delivered to A's subscribers? **No** — it is a pair,
   so `send` on A delivers to B's subscribers only (and vice versa). That is
   the "relay to the other peer" model, mirroring the demo's room relay where
   a sender's bytes go to the *other* client. Document it as "exactly two
   peers, mesh-2"; a true many-node in-memory bus is a different (later) need.
3. Delivery is synchronous by default; expose an optional `async?: boolean`
   that routes through `queueMicrotask` so tests can interleave.
4. `dispose()` on either side stops all delivery; later `send` is dropped
   silently (lossy-by-design, matching the client's swallowing).
5. DOM-free and dependency-free — must not import `document`/`window` and must
   run under the `core` node-env vitest project.

## Scope

**In scope (A)**: `packages/dom/src/binding.ts` (flag + observer wiring +
cleanup), a small `packages/dom/src/autoRegister.ts` helper (scan + diff
logic, keep `binding.ts` lean), `packages/dom/test/autoRegister.test.ts`,
README capability line.

**In scope (B)**: `packages/core/src/inMemoryTransport.ts`
(`packages/core/src/index.ts` export), `packages/core/test/inMemoryTransport.test.ts`,
`docs/transports.md` short "Testing without a browser" section.

**Out of scope**: reusing the scheduler's geometry watcher (deliberately
separate); shadow-DOM deep mutation edge cases beyond the existing
`ancestors` cross-shadow walk (the watch is best-effort on shadow trees —
document as a known limitation, do not over-engineer); a many-node in-memory
bus (the pair is the scope); Socket.IO/SignalR in core (owner row 8 — stays in
`examples/*`).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | `bun install` | exit 0 |
| DOM unit tests | `bunx vitest run --project dom` | pass |
| Core unit tests | `bunx vitest run --project core` | pass |
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | green |
| Full gate | `bunx vitest run` | all projects green, clean exit |

## Steps

### Deliverable A

#### Step A1 — `autoRegister.ts` helper

A pure, testable function operating on a `Document`-like root and the
`AnchorRegistry`:

```ts
type AutoRegisterOptions = {
  attribute?: string;      // default "data-anchor"
  root?: Node;             // default document
  registry: AnchorRegistry;
  explicit: WeakSet<Element>; // elements with a manual register
  onAutoRegistered(id: string, el: Element): void;
  onAutoUnregistered(id: string, el: Element): void;
  MutationObserverCtor?: MutationObserverCtor;
};
type AutoRegisterHandle = { dispose(): void };
function startAutoRegister(opts: AutoRegisterOptions): AutoRegisterHandle;
```

Implement the scan (initial + mutation diff) here. Track the auto-owned
unregister fns in a `Map<Element, () => void>` so element-removal can call the
right one and can be told apart from an explicit one.

**Verify**: tsc green; no DOM test yet.

#### Step A2 — wire into `createDomBinding`

- Add `autoRegister` + `autoRegisterAttribute` to `DomBindingOptions`.
- In `createDomBinding`, after `createAnchorRegistry()`, if the flag is on,
  build the `explicit` `WeakSet` and a small shim over the registry so that
  an explicit `binding.registry.register(id, el)` also marks `el` in
  `explicit` (wrap the registry's `register` return so the unregister clears
  the mark). Then call `startAutoRegister`.
- Add the auto handle to `dispose()`: `autoHandle.dispose()` unregisters all
  auto anchors and disconnects the observer.
- Pass `environment.MutationObserverCtor ?? win.MutationObserver` through.

**Verify**: tsc green; existing `dom` tests still pass (flag default off → no
behavior change).

#### Step A3 — tests `packages/dom/test/autoRegister.test.ts`

jsdom. Cover at minimum:

1. Default (flag off): registering via attribute does nothing; a
   `data-anchor` element is NOT resolvable by `registry.get(id)`.
2. Flag on + pre-existing element: `document.body.innerHTML =
   '<div data-anchor="a"></div>'`; after `createDomBinding(client, {
   autoRegister: true })`, `registry.get("a")` returns the element and
   `ancestors(el)` includes `a`.
3. Add at runtime: append a `data-anchor="b"` node after binding → appears in
   the registry without a new binding.
4. Remove: remove the node → `registry.get` no longer resolves it.
5. Attribute value change `a → a2`: old gone, new present.
6. Explicit wins: `binding.registry.register("a", otherEl)` for an element the
   auto-observer also sees → the explicit element wins; unmark after the
   explicit unregister re-allows auto.
7. Collision: two elements, `data-anchor="dup"` → no throw, registry holds one
   (whichever the registry's last-wins rule keeps), dev-warning spy called.
8. Dispose: `binding.dispose()` → auto anchors gone, observer disconnected
   (spy on the injected ctor's `disconnect`), explicit anchors remain.
9. Idempotent remount: create→dispose→create a second binding → no leaked
   registry entries, still resolves the live attributes.

**Verify**: `bunx vitest run --project dom` green, suite visible.

#### Step A4 — README + docs line

`packages/dom/README.md`: one paragraph + the `data-anchor` snippet under the
capabilities; note the opt-in flag, the explicit-wins rule, and the shadow-DOM
best-effort limitation. Add the capability row to the top-level README matrix.

**Verify**: `grep -n "data-anchor" packages/dom/README.md` ≥ 1.

### Deliverable B

#### Step B1 — `inMemoryTransport.ts`

Implement the pair as specified. Keep each side's state (`status`,
listeners) symmetric; centralize delivery in a small `deliver(from, bytes)`
that checks the other side's `disposed`.

**Verify**: tsc green.

#### Step B2 — tests `packages/core/test/inMemoryTransport.test.ts`

node env. Cover:

1. Client A `send` (via an actual `createPresenceClient` wired to side `a`)
   reaches client B's `getRemoteSnapshot()` (the end-to-end proof the client's
   decode+validate runs on the other side).
2. `subscribeStatus` replays; `getStatus()` matches across a
   `connect → (send) → disconnect` cycle.
3. `dispose()` stops delivery (a send after dispose is dropped, no throw).
4. `async: true` routes delivery through a microtask (assert ordering with
   `await Promise.resolve()` / `flushPromises`).
5. No DOM leakage: the test file must not import `document`; run under
   `--project core` (node env).

**Verify**: `bunx vitest run --project core` green.

#### Step B3 — docs

`docs/transports.md` → "Testing without a browser": a 6-line example
(`const { a, b } = createInMemoryPair(); const clientA =
createPresenceClient({ transport: a }); a.connect(); …`) and a note that it is
a 2-peer mesh and that the client does the encode/validate.

**Verify**: `grep -n "createInMemoryPair" docs/transports.md` ≥ 1.

## Done criteria

- [ ] (A) `autoRegister` flag on `DomBindingOptions`, default-off, with all A3 behaviors passing
- [ ] (A) explicit-register precedence and dispose cleanup proven by tests
- [ ] (B) `createInMemoryPair` exported from `core`, end-to-end client test passing, node-only
- [ ] `bunx vitest run` all projects green; `bunx tsc --build …` green
- [ ] READMEs + `docs/transports.md` updated
- [ ] Two commits (A, then B); `plans/README.md` row updated

## STOP conditions

- The auto-observer and the scheduler's geometry observer must share a single
  `MutationObserver` to avoid double work, and they cannot be cleanly
  separated → STOP and report; the plan intentionally keeps them separate.
- Auto-registration produces anchors that break the occlusion/geometry
  invariants (e.g. a registered element that the scheduler cannot frame
  because it is inside an out-of-scope shadow root) → STOP with a failing
  case; do not paper over it.
- `createInMemoryPair` is asked to model more than two peers (a many-node bus)
  before this plan → STOP; the pair is the scope; a bus is a follow-up.
- A `data-anchor` element that is also an explicit anchor causes a
  double-`register` cycle (observer re-registers after explicit unregister,
  loop) → STOP and report the lifecycle ordering problem.

# Plan 012: Architecture deepening — six candidates from the 2026-08-19 review

> **Executor instructions**: Execute the five phases IN ORDER. Each phase ends
> with its gate and its OWN commit, so any phase can be reverted alone. On a
> STOP condition, stop and report. Update the status row in `plans/README.md`
> when all phases are done.
>
> **Drift check (run first)**:
> `git diff --stat 6ac92fb..HEAD -- packages/dom packages/react packages/core apps/demo/src/cursors`
> On drift in an in-scope file, re-baseline against live code; on a contract
> change, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (hot-path refactors in the most-churned package)
- **Depends on**: plan 010 merged (it is, at `6ac92fb`)
- **Category**: tech-debt
- **Planned at**: commit `6ac92fb`, 2026-08-19

## Why this matters

The architecture review found the `packages/dom` hot spot (two real regressions this month) is shallow at three seams, the react adapter forces consumers to hand-roll store selection, and the demo policy is untestable. Owner directive: fix all six candidates; the code must end clean.

## Binding design decisions (do not redesign)

1. **Resolver interface** (candidate 1): `RemoteResolver.resolveAll(presences, readState, timestampMs)` — three parameters. `readState` is the existing `SchedulerReadState`. The presence-identity diff (`networkUpdated`) moves INSIDE the resolver, stored per client beside the interpolator states; `prune()` cleans it. `binding.ts` deletes `lastSeenPresenceByClientId` and the diff loop.
2. **Occlusion reader** (candidate 4): `SchedulerReadState` gains `getStyle(element): { overflowX: string; overflowY: string; overflow: string }`-shaped access (scheduler owns `win.getComputedStyle`; tests stub via the reader). `computeVisibleRect(element, rect, readState, onClippingAncestor?)` — the four injection params collapse into the reader; no positional `undefined` anywhere.
3. **Options grouping** (candidate 6):
   ```ts
   type DomBindingOptions<TContext, TUser> = {
     maxAnchors?: number;
     resolution?: { visibilityPolicy?; interpolatorFactory?; hitTest?: boolean };
     environment?: { root?: Document; window?: Window; raf?; caf?; ResizeObserverCtor?; MutationObserverCtor? };
   };
   ```
   Each group forwards as ONE object (default `{}`); the fourteen conditional spreads die. The pointer source reads `environment.root/window`. This is a breaking change to an unpublished 0.1.0 package — allowed. `LiveCursorProvider`'s `bindingOptions` passes through unchanged in mechanism; demo `main.tsx` updates to the new shape.
4. **FrameCache** (candidate 5): extract the scheduler's `lastRectCache`/`lastClientRectCache`/`lastViewportSize` trio into one internal `FrameCache` module with `measure(anchors)`, `reuse()`, `clear()`, and the `SchedulerReadState` accessors built on it. Behavior-preserving: every existing scheduler test passes UNCHANGED (assertions untouched). The "clear then final pass re-measures" contract becomes explicit in the FrameCache interface docs comment (one line).
5. **Selector hook** (candidate 2): new public hook in `@anchor-presence/react`:
   ```ts
   function useRemoteCursorsSelector<TSelected, TContext = unknown, TUser = unknown>(
     select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
     isEqual?: (a: TSelected, b: TSelected) => boolean, // default Object.is
   ): TSelected;
   ```
   Implementation: subscribe to the binding, cache the last selection, re-select on store notification, keep the previous reference when `isEqual` says unchanged; server snapshot = `select([])` computed once. Migrate BOTH adapters: `PresencePill` (delete `membershipIsUnchanged`/`selectClippedClientIds`/refs — use the hook with a set-equality `isEqual`), and `CursorLayer`'s visible-filter (shallow-array `isEqual` so an unchanged filtered array keeps identity). The raw-context cast in PresencePill dies.
6. **Demo policy factory** (candidate 3): `createVisibilityPolicy(getLocalState: () => { page: string | null; settingsOpen: boolean })` returns the same plain synchronous callback (settled ruling intact). One mutable `localState` object created in `main.tsx` beside the client; `App.tsx`'s existing context effect becomes the SINGLE writer (it already owns `page` and `settingsOpen`); `settings-dialog.tsx` stops importing `setLocalSettingsOpen`. New test file `apps/demo` has no vitest project — put the policy tests in `packages/dom/test/`? NO — demo code stays demo-side: add `apps/demo/src/cursors/visibilityPolicy.test.ts` and a `demo` node-env project entry in `vitest.config.ts` including only that path. The factory is pure; tests need no DOM.

## Phases

- **Phase 1** = decisions 1 + 2 (resolver + occlusion reader; same files, one commit).
- **Phase 2** = decision 3 (options grouping; touches dom + react provider passthrough types + demo main.tsx + docs).
- **Phase 3** = decision 4 (FrameCache; scheduler only).
- **Phase 4** = decision 5 (selector hook; react + demo consumers + spec/docs).
- **Phase 5** = decision 6 (demo policy factory + its tests + vitest project entry).

## Gate (every phase)

| Command | Expected |
|---|---|
| `bunx tsc --build packages/core packages/dom packages/react` | exit 0 |
| `bunx vitest run` | 0 failed; count never below 188 (grows in phases 4–5) |
| `cd apps/demo && bunx vite build` | exit 0 |
| `bunx playwright test e2e/cross-layout-chromium.spec.ts e2e/occlusion.spec.ts e2e/perf.spec.ts --project=chromium` | 0 failed |

After Phase 5 additionally: full `bunx playwright test` (0 failed), perf spec 3× (0 failed), `git diff --check` clean.

## Documentation duties

- Phase 2: `docs/react.md` + `packages/react/README.md` + `packages/dom/README.md` wherever `DomBindingOptions`/`bindingOptions` shapes appear.
- Phase 4: SPECIFICATION.md version 1.3 → 1.4; add the selector hook to the §14 hook table; `docs/react.md` gains a selector example (PresencePill's clipped-ids case). Simplified Technical English.
- Existing e2e selectors and demo appearance stay identical throughout.

## Scope

**In scope**: `packages/dom/src/{resolver,occlusion,binding,scheduler,pointer,index}.ts`, `packages/dom/test/*`, `packages/react/src/{hooks,cursor,index}.ts` + provider TYPES only (passthrough), `packages/react/test/*`, `apps/demo/src/cursors/{visibilityPolicy.ts,visibilityPolicy.test.ts,PresencePill.tsx,CursorLayer.tsx}`, `apps/demo/src/main.tsx`, `apps/demo/src/App.tsx` (context effect only), `apps/demo/src/components/dashboard/settings-dialog.tsx` (remove the flag import only), `vitest.config.ts` (one added project), `SPECIFICATION.md`, `docs/react.md`, `packages/{dom,react}/README.md`, `plans/README.md` (status).
**Out of scope**: `packages/core` source (listener-set/omitUndefined dedup there was reviewed and REJECTED as cross-package churn), protocol/transport/codec, e2e test files, `apps/server`, dependencies/lockfile, provider runtime behavior.

## STOP conditions

- Any phase's gate fails twice after a reasonable correction — revert that phase, record, continue with the next independent phase.
- A scheduler test ASSERTION must change in Phase 3 (behavior-preserving means none may).
- The selector hook cannot keep `rerenderIsolation`/`perf` tests green without loosening a budget.
- An out-of-scope file must change.
- e2e selector or demo visual change required.

## Done criteria

- [ ] All five phases committed separately, each gate green.
- [ ] `resolveAll` has three parameters; `networkUpdated` appears nowhere in `binding.ts`.
- [ ] `grep -c "!== undefined ? {" packages/dom/src/binding.ts` returns 0.
- [ ] `computeVisibleRect` takes a reader; no positional `undefined` at its call sites.
- [ ] Scheduler tests pass with zero assertion edits; FrameCache exists.
- [ ] `useRemoteCursorsSelector` exported; PresencePill ≤ ~60 lines total; CursorLayer filter identity-stable.
- [ ] Demo policy has a test file that runs in `bunx vitest run`; no module-level `let` flags remain in `visibilityPolicy.ts`.
- [ ] SPECIFICATION.md v1.4; docs updated; STE style.
- [ ] Full suite + full Playwright + 3× perf green at the end.

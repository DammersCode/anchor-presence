# Plan 004: Close the two accepted spec deviations (pointer rect-cache reuse, bench resize/nested-scroll scenarios)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. On any STOP condition,
> stop and report. When done, update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- packages/dom/src/pointer.ts packages/dom/src/binding.ts packages/dom/src/scheduler.ts apps/demo/src/bench`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-ci-github-actions.md (CI protects the hot path); execute AFTER plan 003 to avoid scheduler merge conflicts
- **Category**: tech-debt
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

Two documented deviations from SPECIFICATION.md were accepted during review and flagged "good and important" by the owner:
1. Spec §9: "Rect reads for the outbound path reuse the geometry cache when the frame already measured that element" — `pointer.ts` always calls `getBoundingClientRect` directly, causing avoidable duplicate reads while remote cursors are active.
2. Spec §16 benchmark scenarios "frequent resize" and "nested scrolling" are missing from the bench page; the cursor×anchor matrix exists.

## Current state

- `packages/dom/src/pointer.ts` — in the pointermove sampling path each anchor in the chain is measured with a direct `element.getBoundingClientRect()` (search `getBoundingClientRect` in the file). It has no access to the scheduler's per-frame cache.
- `packages/dom/src/scheduler.ts` — holds `lastRectCache: Map<Element, Rect> | null` (cache of the last READ phase) plus `lastViewportSize`. Not exported to other modules today.
- `packages/dom/src/binding.ts` — `createDomBinding` constructs scheduler THEN pointer source (`attachPointerSource(client, registry, {...})`); it is the only place both exist, so the cache hand-off wires here.
- `apps/demo/src/bench/BenchPage.tsx` — bench page: anchor-count and cursor-count selectors, synthetic cursors via a loopback transport, mean/p95 ms-per-pass stats (`useSchedulerPassStats`).
- Conventions: strict TS, one-line why-comments only, dom tests in `packages/dom/test/` with mocked rects, vitest project `dom`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | exit 0 |
| Dom tests | `bunx vitest run --project dom` | all pass |
| All tests | `bunx vitest run` | all pass |
| Demo build | `cd apps/demo && bunx vite build` | success |
| e2e | `bunx playwright test` | 0 failed |

## Scope

**In scope**: `packages/dom/src/{scheduler.ts,pointer.ts,binding.ts,index.ts}`, `packages/dom/test/{pointer.test.ts,scheduler.test.ts}`, `apps/demo/src/bench/*`.
**Out of scope**: `packages/core`, `packages/react`, resolver logic, e2e files, SPECIFICATION.md (behavior converges TO the spec; no spec change needed).

## Git workflow

Branch `advisor/004-deviations`; plain commit messages, no AI mention; do not push unless instructed.

## Steps

### Step 1: Expose a read-only cache getter on the scheduler

Add to the object returned by `createGeometryScheduler`: `getCachedRect(element: Element): Rect | undefined` returning `lastRectCache?.get(element)`. No other surface.

**Verify**: typecheck clean; existing scheduler tests green.

### Step 2: Let the pointer source accept the getter

`PointerSourceOptions` gains optional `getCachedRect?: (el: Element) => Rect | undefined`. In the sampling loop use `getCachedRect?.(element) ?? element.getBoundingClientRect()` (normalize to the shared `Rect` shape from `geometry.ts`). `binding.ts` passes the scheduler's getter through.

Staleness note (inline as a one-line comment in code): the cache only holds rects from the current/last frame; every layout-changing signal invalidates and re-measures, so a hit is at most one frame old — the tolerance spec §9 explicitly grants.

**Verify**: `bunx vitest run --project dom` green.

### Step 3: Pointer cache tests

In `pointer.test.ts`: (a) with a `getCachedRect` stub returning a rect, `getBoundingClientRect` is NOT called for that element (spy); (b) cache miss falls through to direct measurement; (c) without the option, behavior unchanged.

**Verify**: `bunx vitest run --project dom` green, ≥3 new tests.

### Step 4: Bench "resize storm" scenario

BenchPage: add a toggle button "Resize storm (5s)". While active, a rAF loop oscillates the anchor-grid container's width (e.g. 60%↔100% via inline style) for 5 seconds while stats collect. Display the storm-phase mean/p95 separately from idle stats.

**Verify**: `cd apps/demo && bunx tsc --noEmit && bunx vite build` clean.

### Step 5: Bench "nested scroll" scenario

BenchPage: add a mode rendering the anchor grid inside a fixed-height `overflow-auto` box nested in a second scrollable box; a toggle auto-scrolls the inner box (rAF, sawtooth scrollTop) for 5 seconds while stats collect.

**Verify**: build clean; manual smoke — `bunx vite dev` + open `/?page=bench`, both toggles produce non-zero pass counts and plausible ms numbers (record them in the report).

## Test plan

Unit: the three pointer-cache tests (Step 3), modeled on existing `pointer.test.ts` cases. Bench scenarios are measurement tools, not test-gated — verified by build + manual smoke with recorded numbers.

## Done criteria

- [ ] `grep -n "getCachedRect" packages/dom/src/pointer.ts packages/dom/src/binding.ts` — both wired
- [ ] `bunx vitest run` all green incl. 3 new pointer tests
- [ ] `bunx playwright test` 0 failed
- [ ] Bench page shows both new toggles; numbers recorded in the completion report
- [ ] `plans/README.md` updated

## STOP conditions

- Wiring the getter requires reordering scheduler/pointer construction in `binding.ts` in a way that changes dispose semantics — report.
- Storm-phase p95 exceeds 5ms on the 100-anchor default — report numbers; optimization is out of scope here.

## Maintenance notes

- If plan 003 landed first (recommended), `computeVisibleRect` also flows through `readState.getRect`; keep the two cache paths (`readState.getRect` per-pass vs `getCachedRect` cross-frame) distinct — do not merge them.
- Future: if pointer sampling ever moves into the rAF pass itself, delete `getCachedRect` and this indirection entirely.

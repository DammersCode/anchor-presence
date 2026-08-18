# Plan 009: Prove core and React adapter performance with budgeted, repeatable benchmarks

> **Executor instructions**: Follow step by step; verify each step; STOP
> conditions are binding. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- packages/core packages/react vitest.config.ts e2e apps/demo/src/bench`
> Plans 003–007 landing is EXPECTED drift; re-baseline excerpts if they moved lines.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive tests/benches only)
- **Depends on**: plans/001-ci-github-actions.md; run AFTER 004 if both are scheduled (004 touches the bench page)
- **Category**: perf
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

SPECIFICATION.md §16 states performance budgets (one rAF pass per frame, each anchor measured once per frame, <2 ms scripting per pass at 100 cursors/20 anchors, zero rAF while idle) but only the dom scheduler is instrumented (demo `/bench` page). Nothing measures the CORE hot path (decode→validate→ingest at 20 Hz × N clients) or the REACT adapter (per-frame commit cost, rerender containment). Owner directive: verify that core and react are, in general, performant — with numbers, not assumptions, and with regression gates so future plans (003 occlusion walk, 005 dependency majors) cannot silently regress them.

## Current state

- `packages/core` hot path: `client.ts` transport subscriber → `codec.decode` → `validatePresence` → `store.ingest`; `store.getSnapshot()` allocates a new array only when content changed.
- Vitest is the test runner (root `vitest.config.ts`, projects core/dom/react). Vitest ships a built-in benchmark mode: files named `*.bench.ts` run with `vitest bench`; no new dependency needed.
- `packages/react/test/rerenderIsolation.test.tsx` — existing pattern: render-count probe asserting a sibling component does not rerender on cursor updates. `packages/react/src/hooks.ts` — all hooks use `useSyncExternalStore`.
- `apps/demo/src/bench/BenchPage.tsx` — scheduler pass stats (mean/p95) driven by a loopback transport; URL `/?page=bench`; selectors for cursor count (1/10/50/100) and anchor count (10/100/1000). Stats render into the DOM (readable by Playwright).
- `e2e/helpers.ts` + `playwright.config.ts` — harness that boots relay + vite dev; chromium project available.
- Measured baseline (2026-08-18, dev machine): 100 anchors × 10 cursors ≈ 0.25 ms mean / 0.4 ms p95 per pass; 1000 × 100 ≈ 1.5 ms mean, p95 ≈ 10 ms (dominated by dev-mode React rendering of 1000 cells).
- Spec §16 budgets are the contract; CI machines are slower and noisier than dev machines — gates below use ~3× headroom.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Unit tests | `bunx vitest run` | all pass |
| Core benches | `bunx vitest bench --project core --run` | table of ops/sec, exit 0 |
| e2e | `bunx playwright test` | 0 failed |
| Perf e2e only | `bunx playwright test e2e/perf.spec.ts` | 0 failed |

## Scope

**In scope**: `packages/core/bench/*.bench.ts` (create), `vitest.config.ts` (bench include for the core project only), `packages/core/test/allocation.test.ts` (create), `packages/react/test/perf.test.tsx` (create), `e2e/perf.spec.ts` (create), `.github/workflows/ci.yml` (add the bench + perf steps), `apps/demo/src/bench/BenchPage.tsx` ONLY if a stat needs a `data-testid` for Playwright to read.
**Out of scope**: any optimization. This plan MEASURES; if a budget fails, that failure is the deliverable (report it) — fixing is a follow-up plan. No changes to package source files.

## Git workflow

Branch `advisor/009-perf`; plain messages, no AI mention; no push unless instructed.

## Steps

### Step 1: Core micro-benchmarks

`packages/core/bench/hotpath.bench.ts` with vitest `bench()`:
- `validatePresence` on a realistic 4-anchor message (pre-decoded object)
- `jsonCodec.decode` + `validatePresence` combined on encoded bytes
- `store.ingest` steady-state: 64 clients, sequential sequences
- full inbound path via a stub transport: bytes → snapshot listener fired
- `getSnapshot()` identity: 10k calls with no changes (must not allocate — measured via ops/sec being near-free)

Wire `*.bench.ts` into the core project's bench include in `vitest.config.ts` without affecting `vitest run`.

**Verify**: `bunx vitest bench --project core --run` exits 0 and prints ops/sec for all five; `bunx vitest run` unchanged count.

### Step 2: Core throughput floor as a normal test

`packages/core/test/allocation.test.ts`: (a) throughput floor — process 20,000 realistic inbound messages (64 senders) through decode→validate→ingest in a loop; assert wall time < 2 s (≈ >10k msg/s — 25× the real 20 Hz × 64 clients load; generous for CI). (b) snapshot stability — after ingest settles, 1,000 `getSnapshot()` calls return the identical array reference. (c) sequence-drop path costs no allocation growth: ingest 10k stale-sequence messages, assert snapshot reference unchanged throughout.

**Verify**: `bunx vitest run --project core` green including the 3 new tests.

### Step 3: React adapter render-containment tests

`packages/react/test/perf.test.tsx` (model on `rerenderIsolation.test.tsx`):
- N=100 snapshot publishes cause EXACTLY 100 renders of the `useRemoteCursors` consumer and 0 of a sibling (strict equality on counts, not "less than").
- A publish with an UNCHANGED snapshot reference causes 0 additional renders (useSyncExternalStore short-circuit).
- `<React.Profiler>` wrapper: mean commit duration for a 100-cursor list update stays under 10 ms in jsdom (generous; jsdom has no layout — this catches accidental O(n²) render work, not paint cost).
- Provider mount/unmount 50× leaks nothing: after unmounts, publishing to the binding calls zero listeners (subscription cleanup proof).

**Verify**: `bunx vitest run --project react` green, 4 new tests.

### Step 4: Browser perf gate via the bench page

`e2e/perf.spec.ts` (chromium only): open `/?page=bench`, select 100 anchors × 50 cursors, let stats accumulate ≥ 200 passes, read the mean/p95 from the page (add `data-testid="bench-mean"` / `"bench-p95"` to BenchPage if absent). Assert mean < 6 ms and p95 < 20 ms (3× spec budget + CI headroom; dev-machine baseline is 0.25/0.4 ms — these bounds catch order-of-magnitude regressions, not noise). Also assert the idle contract: set cursors to 0, wait 1 s, assert the pass counter stops incrementing (zero rAF while idle, spec §16).

**Verify**: `bunx playwright test e2e/perf.spec.ts` 0 failed, three consecutive runs (flake check).

### Step 5: CI wiring

Append to `.github/workflows/ci.yml`: the bench step (`bunx vitest bench --project core --run`, report-only — benches inform, tests gate) after unit tests; `e2e/perf.spec.ts` runs inside the existing `bunx playwright test` step automatically (confirm it is not excluded).

**Verify**: local run of each added command matches expected output; workflow file lists them.

## Test plan

Steps 2–4 ARE the tests: 3 core perf-contract tests, 4 react containment tests, 1 browser perf spec with idle assertion. Benches (Step 1) are report-only by design — absolute ops/sec varies by machine; the floors live in the tests with generous headroom.

## Done criteria

- [ ] `bunx vitest bench --project core --run` prints 5 benches, exit 0
- [ ] `bunx vitest run` green with 7 new perf tests (3 core + 4 react)
- [ ] `bunx playwright test` 0 failed incl. `perf.spec.ts`, stable across 3 runs
- [ ] CI workflow carries the bench step; perf spec not excluded
- [ ] No package source modified (`git diff --stat -- packages/*/src` empty)
- [ ] Numbers from all steps pasted into the completion report; `plans/README.md` updated

## STOP conditions

- Any budget in Steps 2–4 FAILS on current code — do not optimize and do not loosen the budget; report the measured numbers as a finding (that is this plan succeeding at its job).
- The bench-page stats cannot be read without restructuring BenchPage beyond data-testid additions — report.
- Step 4 flakes across the 3-run check even with the generous bounds — report the variance; consider marking it report-only ONLY with operator approval.

## Maintenance notes

- Plans 003 (occlusion walk) and 005 (dependency majors) MUST rerun this suite; the occlusion walk adds per-ancestor work to the hot path — if Step 4's mean rises past its bound, that plan's STOP condition fires, by design.
- The 3× budget headroom is calibrated for GitHub-hosted runners; if CI moves to faster self-hosted machines, tighten toward spec §16 numbers.
- If TS 7 (plan 005 wave 4) lands, rerun benches before/after — compiler output differences occasionally shift hot-loop performance; keep both tables in that plan's report.

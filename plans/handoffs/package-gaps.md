# Handoff: package-gaps

Branch `package-gaps`, from `dev`. Closing the `packages/*` gaps in `plans/022-gap-closure-2026-09-25.md`.

## Done

- [P0] Reduced motion: `createDomBinding` now defaults `resolution.interpolatorFactory` to `noneInterpolator` when `matchMedia("(prefers-reduced-motion: reduce)")` matches, else `linearInterpolator`. Evaluated lazily inside `createDomBinding` (no `window` at import time). An explicit `resolution.interpolatorFactory` still wins. `packages/dom/src/binding.ts`. Tests in `packages/dom/test/binding.test.ts` (`describe("prefers-reduced-motion")`). Not yet committed (commit hash to follow once the commit lands).

## In progress

- None right now.

## Next

1. [P0] Benchmarks: port `packages/core/bench/hotpath.bench.ts` off `vitest`'s removed `bench` to `tinybench`, as a root `bun run bench` script with a committed baseline JSON and a `3x` tolerance, `--update-baseline` flag. Remove bench config from `vitest.config.ts`.
2. [P1] Idle stage in `packages/core/src/store.ts`: add `idleAfterMs` (below stale timeout), expose idle on the remote cursor/user; `packages/react` dims idle cursors (CSS opacity, respects reduced motion). Stale timeout still removes the peer — idle is a rendering stage, not a lifecycle change.
3. [P1] Off-screen: check whether the resolver already exposes an in-viewport/visible flag; if not, add a minimal `offscreen` flag (no UI in the library).
4. [P2] `packages/dom/src/auto-register.ts` `resyncId`: batch the per-id `querySelectorAll` into one pass over a Set.
5. [P2] `packages/react/src/hooks/use-remote-cursors.ts`: cache `select` result by input-array identity.
6. [P2] `packages/react/src/hooks/use-remote-users.ts`: preserve array/object identity when nothing user-relevant changed.
7. [P2] `packages/react/src/cursor.tsx`: `forced-colors: active` support (`forced-color-adjust: none` or system-color outline).
8. Run all AGENTS.md gates, incl. `bunx playwright test --project=chromium`, before wrapping up.

## Decisions made (and why)

- Reduced motion = snap to resolved position (no glide), per plan. Implemented by swapping the default interpolator, not by adding a new option — the existing `resolution.interpolatorFactory` option already covers overrides.
- Idle (next item): dimmed rendering only; the stale timeout still removes the peer. Idle is a new, earlier stage, not a replacement for stale removal.
- Off-screen (next item): expose a flag only; no edge-indicator UI ships in the library (that's an app concern).
- Bench (next item): tinybench directly, baseline JSON committed next to the bench file, tolerance ×3 for CI noise, `--update-baseline` to refresh.

## Blockers/open questions

- None currently.

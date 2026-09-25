# Handoff: package-gaps

Branch `package-gaps`, from `dev`. Closing the `packages/*` gaps in `plans/022-gap-closure-2026-09-25.md`.

## Done

- [P0] Reduced motion: `createDomBinding` now defaults `resolution.interpolatorFactory` to `noneInterpolator` when `matchMedia("(prefers-reduced-motion: reduce)")` matches, else `linearInterpolator`. Evaluated lazily inside `createDomBinding` (no `window` at import time). An explicit `resolution.interpolatorFactory` still wins. `packages/dom/src/binding.ts`. Tests in `packages/dom/test/binding.test.ts` (`describe("prefers-reduced-motion")`). Commit: `0d53361`.
- [P0] Benchmarks: `packages/core/bench/hotpath.bench.ts` now exports `registerHotPathCases(bench)` for `tinybench` instead of using vitest's removed `bench`. New `scripts/bench.ts` runs it, prints a `console.table`, compares each op's mean against `packages/core/bench/baseline.json` × 3 tolerance, exits non-zero on a regression or a task error, and supports `bun run bench -- --update-baseline`. Root script `bun run bench`. Removed the stale `benchmark` block from `vitest.config.ts`. Added `packages/core/bench` and `scripts/bench.ts` to `tsconfig.test.json` so the script and cases are actually typechecked (they weren't before — the old vitest `bench` block only ran, never typechecked). Fixed a real TS7 closure-narrowing bug in the bench cases (`let subscriber` narrowed to `never`; switched to a `{ current }` box) that typecheck caught once the file was included. Not yet committed.

## In progress

- None right now.

## Next

1. [P1] Idle stage in `packages/core/src/store.ts`: add `idleAfterMs` (below stale timeout), expose idle on the remote cursor/user; `packages/react` dims idle cursors (CSS opacity, respects reduced motion). Stale timeout still removes the peer — idle is a rendering stage, not a lifecycle change.
2. [P1] Off-screen: check whether the resolver already exposes an in-viewport/visible flag; if not, add a minimal `offscreen` flag (no UI in the library).
3. [P2] `packages/dom/src/auto-register.ts` `resyncId`: batch the per-id `querySelectorAll` into one pass over a Set.
4. [P2] `packages/react/src/hooks/use-remote-cursors.ts`: cache `select` result by input-array identity.
5. [P2] `packages/react/src/hooks/use-remote-users.ts`: preserve array/object identity when nothing user-relevant changed.
6. [P2] `packages/react/src/cursor.tsx`: `forced-colors: active` support (`forced-color-adjust: none` or system-color outline).
7. Run all AGENTS.md gates, incl. `bunx playwright test --project=chromium`, before wrapping up.

## Decisions made (and why)

- Reduced motion = snap to resolved position (no glide), per plan. Implemented by swapping the default interpolator, not by adding a new option — the existing `resolution.interpolatorFactory` option already covers overrides.
- Idle (next item): dimmed rendering only; the stale timeout still removes the peer. Idle is a new, earlier stage, not a replacement for stale removal.
- Off-screen (next item): expose a flag only; no edge-indicator UI ships in the library (that's an app concern).
- Bench: tinybench directly, baseline JSON committed next to the bench file, tolerance ×3 for CI noise, `--update-baseline` to refresh. Not added to `preversion` (that would block a release on flaky-runner noise); a separate CI step is the right hook — see the CI note below.
- Bench is dev tooling, not a package API/behavior change, so no CHANGELOG entry per AGENTS.md's changelog rule.
- CI step needed (not added — `.github/workflows/*` is out of scope for this worktree): add a `bun run bench` step after `bun run build` (needs the `dist` output only indirectly — the script imports `packages/core/bench/hotpath.bench.ts` from source, so build isn't a hard prerequisite, but running after build/test keeps a consistent job order). Suggest a dedicated job or step so a bench regression doesn't block merges by itself if the team wants it non-blocking initially; recommend it blocking once the baseline settles.

## Blockers/open questions

- None currently.

# Handoff: package-gaps

Branch `package-gaps`, from `dev`. Closing the `packages/*` gaps in `plans/022-gap-closure-2026-09-25.md`.

## Done

- [P0] Reduced motion: `createDomBinding` now defaults `resolution.interpolatorFactory` to `noneInterpolator` when `matchMedia("(prefers-reduced-motion: reduce)")` matches, else `linearInterpolator`. Evaluated lazily inside `createDomBinding` (no `window` at import time). An explicit `resolution.interpolatorFactory` still wins. `packages/dom/src/binding.ts`. Tests in `packages/dom/test/binding.test.ts` (`describe("prefers-reduced-motion")`). Commit: `0d53361`.
- [P0] Benchmarks: `packages/core/bench/hotpath.bench.ts` now exports `registerHotPathCases(bench)` for `tinybench` instead of using vitest's removed `bench`. New `scripts/bench.ts` runs it, prints a `console.table`, compares each op's mean against `packages/core/bench/baseline.json` × 3 tolerance, exits non-zero on a regression or a task error, and supports `bun run bench -- --update-baseline`. Root script `bun run bench`. Removed the stale `benchmark` block from `vitest.config.ts`. Added `packages/core/bench` and `scripts/bench.ts` to `tsconfig.test.json` so the script and cases are actually typechecked (they weren't before — the old vitest `bench` block only ran, never typechecked). Fixed a real TS7 closure-narrowing bug in the bench cases (`let subscriber` narrowed to `never`; switched to a `{ current }` box) that typecheck caught once the file was included. Commit: `236a6fc`.
- [P1] Idle stage: `RemotePresenceStore` gains `idleAfterMs` (default `DEFAULT_IDLE_AFTER_MS = 15_000`, clamped below `staleTimeoutMs`) and computes `idle` per entry in `sweep()` (which also now runs at `min(staleTimeoutMs, idleAfterMs) / 2` so an idle transition shows up within one tick). `RemotePresence.idle` and `ResolvedCursor.idle` (via `RemoteResolver.resolveAll`'s new optional `isIdle` lookup, wired in `createDomBinding` from `client.getRemotePresence()`) both carry it, preserving the existing identity-caching invariants (unchanged idle keeps object identity). `useRemoteUsers` entries and `CursorLayer` both surface it; `CursorLayer` dims an idle cursor to `opacity: 0.4` and skips the `transition` under `prefers-reduced-motion`. Stale timeout still removes the peer unchanged — idle is a new, earlier, rendering-only stage. `createPresenceClient` accepts `idleAfterMs` too. New tests: `packages/core/test/store.test.ts` (`describe("RemotePresenceStore idle")`), `packages/dom/test/resolver.test.ts` and `packages/dom/test/binding.test.ts` (idle carry-through + identity), `packages/react/test/cursor.test.tsx` (dimming + reduced motion) and `packages/react/test/remote-users.test.tsx`. Public API: `RemotePresence.idle: boolean`, `ResolvedCursor.idle: boolean`, `RemoteUser.idle: boolean`, `RemotePresenceStoreOptions.idleAfterMs?`, `PresenceClientOptions.idleAfterMs?`, `DEFAULT_IDLE_AFTER_MS` (new core export). Commit: `4147308`.

## Skipped

- [P1] Off-screen. `SPECIFICATION.md` §10 already states the policy explicitly: "Offscreen and clipped elements still resolve." `ResolvedCursor.x`/`.y` are receiver-viewport pixels, and the resolver's own `viewportSize` (`packages/dom/src/frame-cache.ts:65`) is exactly `window.innerWidth`/`window.innerHeight` — values every consumer already has. So `offscreen` would be `x < 0 || y < 0 || x >= innerWidth || y >= innerHeight`, computable by the app from data it already receives, with zero extra information from the library. `pointVisible` already covers the distinct concept (clipping-ancestor occlusion). Adding a redundant field would also be speculative: different apps will want different margins/definitions (viewport vs. a scroll container, a pixel buffer for an edge hint, etc.), which is exactly the kind of option AGENTS.md says not to add speculatively. No code change.

## Next

1. [P2] `packages/dom/src/auto-register.ts` `resyncId`: batch the per-id `querySelectorAll` into one pass over a Set.
2. [P2] `packages/react/src/hooks/use-remote-cursors.ts`: cache `select` result by input-array identity.
3. [P2] `packages/react/src/hooks/use-remote-users.ts`: preserve array/object identity when nothing user-relevant changed.
4. [P2] `packages/react/src/cursor.tsx`: `forced-colors: active` support (`forced-color-adjust: none` or system-color outline).
5. Run all AGENTS.md gates, incl. `bunx playwright test --project=chromium`, before wrapping up.

## Decisions made (and why)

- Reduced motion = snap to resolved position (no glide), per plan. Implemented by swapping the default interpolator, not by adding a new option — the existing `resolution.interpolatorFactory` option already covers overrides.
- Idle: dimmed rendering only; the stale timeout still removes the peer. Idle is a new, earlier stage, not a replacement for stale removal.
- Off-screen: skipped — see the Skipped section above. The library already gives apps everything needed to compute it themselves.
- Bench: tinybench directly, baseline JSON committed next to the bench file, tolerance ×3 for CI noise, `--update-baseline` to refresh. Not added to `preversion` (that would block a release on flaky-runner noise); a separate CI step is the right hook — see the CI note below.
- Bench is dev tooling, not a package API/behavior change, so no CHANGELOG entry per AGENTS.md's changelog rule.
- CI step needed (not added — `.github/workflows/*` is out of scope for this worktree): add a `bun run bench` step after `bun run build` (needs the `dist` output only indirectly — the script imports `packages/core/bench/hotpath.bench.ts` from source, so build isn't a hard prerequisite, but running after build/test keeps a consistent job order). Suggest a dedicated job or step so a bench regression doesn't block merges by itself if the team wants it non-blocking initially; recommend it blocking once the baseline settles.

## Blockers/open questions

- None currently.

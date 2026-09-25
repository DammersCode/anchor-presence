# Handoff: demo-e2e-ci

Branch `demo-e2e-ci` from `dev`, worktree `C:/repos/danny/ap-wt-ci`. Closes the demo/e2e/CI gaps in
`plans/022-gap-closure-2026-09-25.md` after `package-gaps`, `docs-fumadocs`, and `examples-backends` merged.
Do not edit `packages/**` here (owned by `package-gaps`).

## Done

- Demo a11y (hash pending commit): darkened `CURSOR_PALETTE` in `apps/demo/src/cursors/palette.ts` (extracted
  from `setup.ts` so it is importable from a `node`-environment vitest test without touching `window`) — every
  color now reaches >=4.5:1 contrast against the white cursor label text (was 7 of 8 failing, not 6 — verified
  with a throwaway contrast script before picking replacements). Added `apps/demo/src/cursors/contrast.ts`
  (pure WCAG contrast-ratio helper) and `apps/demo/src/cursors/contrast.test.ts` (parametrized over the
  palette, runs in the existing `demo` vitest project). `presence-pill.tsx`: added `role="status"
aria-live="polite"` to the connection status wrapper; `reconnecting` now also gets `animate-pulse` on its
  dot so it is visually distinct from `connecting` (both already had distinct text labels). Default room:
  checked `e2e/helpers.ts` — `openPair` always passes an explicit `room` (via `uniqueRoom()`), and the two
  `?page=bench` perf specs that omit `room=` are single-page, not pair, tests. Randomizing was safe; added
  `randomRoom()` to `apps/demo/src/lib/names.ts` and used it as the fallback in `setup.ts` instead of the
  fixed `"main"`.

- E2E (hash pending commit): added `e2e/resilience.spec.ts`, chromium-only (`test.skip` on non-chromium,
  needs `page.routeWebSocket`). (a) "in-place socket drop": `installSocketDropController` in
  `e2e/helpers.ts` calls `page.routeWebSocket(/:8787\//, ...)` on the sender's page before it navigates
  (new `beforeSenderGoto` hook on `openPair`), transparently proxies real relay bytes via
  `connectToServer()`, and exposes `dropOnce()` which closes only the current client-side route. That
  fires the page's real `WebSocket.onclose`, so `packages/dom/src/transport.ts`'s actual
  `scheduleReconnect()`/exponential-backoff runs unmodified — no `page.evaluate` fakery, no reload. The
  test asserts the sender's status pill shows `Reconnecting`/`Connecting` then `Connected`, then moves the
  sender's mouse to a new anchor and asserts the receiver's cursor tracks the new position (proves live
  data flow resumed, not a stale cached cursor — the store's stale timeout is 70s, far outside the test
  window, so the receiver never drops the cursor either way). (b) "room isolation": a third page in its
  own `uniqueRoom()` never sees `[data-testid="remote-cursor"]` and its `presence-count` stays "0 online"
  (peer count excludes self) while the original pair actively moves cursors. Ran both specs with
  `--repeat-each=5` on chromium: 10/10 passed, no flakes. Full chromium suite (`bunx playwright
test --project=chromium`) also green (16/16) after this change, confirming the default-room
  randomization from task 1 does not break `perf.spec.ts`/`reflow-perf.spec.ts` (they load `?page=bench`
  without `room=`, but are single-page, not pair, tests).

- CI (hash pending commit): `.github/workflows/ci.yml` — added `concurrency: { group: ci-${{
  github.ref }}, cancel-in-progress: true }` at the workflow level; cached `~/.bun/install/cache` keyed on
  `hashFiles('bun.lock')` in both the `test` and `docs` jobs; added `actions/setup-dotnet@v4`
  (`dotnet-version: "10.0.x"`) to the `test` job before the build/test steps, so
  `examples/signalr/signalr-hub.test.ts` runs instead of skipping — verified locally first
  (`dotnet --version` -> `10.0.401`, `bunx vitest run --project signalr-example` -> 13/13 passed, both the
  real hub test and the fake-harness test). Kept the `docs` job as-is apart from adding its own Bun cache
  plus a new `apps/docs/.next/cache` cache keyed on `bun.lock` + a hash of `apps/docs/content/**` and
  `apps/docs/app/**`. The chromium E2E step is untouched, still `bunx playwright test --project=chromium`
  with no browser install (preinstalled Chrome via `channel: chrome` on the `chromium` project in
  `playwright.config.ts`). Removed the stale `# bench: vitest 5 --project filter bug...` comment; did not
  add a bench step (bench script lands on the `package-gaps` branch per the plan's spec decisions).

## In progress

- About to start task 4 (SPECIFICATION.md §17).

## Next

1. `SPECIFICATION.md` §17: document which e2e specs run in all 3 browsers vs chromium-only
   (`*-chromium.spec.ts` + `test.skip` guards, now including `resilience.spec.ts`).
2. Run all AGENTS.md gates plus the full 3-browser `bunx playwright test` locally.

## Decisions

- Palette shades: kept each original hue family, moved to its ~700 Tailwind shade (e.g. red `#ef4444` ->
  `#b91c1c`) rather than picking arbitrary darker colors, so the demo's color identity per user stays
  recognizable while clearing WCAG AA with margin (all >=5.0:1 except amber, which is 5.02:1).
- Extracted `apps/demo/src/cursors/palette.ts` out of `setup.ts` rather than mocking `window` in the test,
  because `setup.ts` intentionally touches `window.location` at module-eval time (see its top comment) and
  the vitest `demo` project runs in a `node` environment.
- Socket drop via `page.routeWebSocket` + `connectToServer()` + closing only the client-side route, rather
  than `context.setOffline()` (which also blocks the receiver's page if used on a shared context, and
  offers no way to reconnect except toggling offline back, which does not exercise the transport's own
  `onclose`/backoff timing) or a second relay instance on a free port (more moving parts, and the plan
  explicitly names `routeWebSocket`/`setOffline` as acceptable options).

## Blockers

None.

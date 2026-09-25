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

## In progress

- Nothing in flight; about to start E2E task 2 (in-place socket drop/reconnect, room isolation).

## Next

1. E2E: in-place socket drop + reconnect (chromium, no reload, assert via real backoff in
   `packages/dom/src/transport.ts`); room isolation (third page/room sees no cursor, peer count 0). No fixed
   sleeps. Run new specs with `--repeat-each=5`.
2. CI: `concurrency` group, Bun cache keyed on `bun.lock`, `actions/setup-dotnet` 10.0.x before tests so
   `examples/signalr/signalr-hub.test.ts` runs, keep `docs` job, verify Playwright still uses preinstalled
   Chrome, remove stale bench comment (no bench step — that lands on another branch), cache
   `apps/docs/.next/cache` keyed on bun.lock + content hash.
3. `SPECIFICATION.md` §17: document which e2e specs run in all 3 browsers vs chromium-only
   (`*-chromium.spec.ts` + `test.skip` guards).
4. Run all AGENTS.md gates plus the full 3-browser `bunx playwright test` locally.

## Decisions

- Palette shades: kept each original hue family, moved to its ~700 Tailwind shade (e.g. red `#ef4444` ->
  `#b91c1c`) rather than picking arbitrary darker colors, so the demo's color identity per user stays
  recognizable while clearing WCAG AA with margin (all >=5.0:1 except amber, which is 5.02:1).
- Extracted `apps/demo/src/cursors/palette.ts` out of `setup.ts` rather than mocking `window` in the test,
  because `setup.ts` intentionally touches `window.location` at module-eval time (see its top comment) and
  the vitest `demo` project runs in a `node` environment.

## Blockers

None.

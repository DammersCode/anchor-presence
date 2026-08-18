# Plan 007: Demo-side interpolation style switcher (spring stays OUT of the library)

> **Executor instructions**: Follow step by step; verify each step; STOP
> conditions are binding. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- apps/demo/src packages/core/src/interpolate.ts docs`
> On mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (but rebase over 003/004 if they landed)
- **Category**: docs (executable documentation)
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

Owner decision: the library ships only its existing `none` and `linear` interpolators; richer easing (spring, and any other style) is the application's job via the public `Interpolator` interface. To make that real, the demo gets a live style switcher with a demo-implemented spring — proving the interface is sufficient for consumer-authored interpolators, and giving users copyable reference code. HARD CONSTRAINT: zero new exports or interpolators in `packages/*`.

## Current state

- `packages/core/src/interpolate.ts` — the public contract (already exported):

```ts
export interface Interpolator {
  target(x: number, y: number, timestampMs: number): void;
  shift(dx: number, dy: number): void;  // move current AND target by a delta, no easing
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
}
export type InterpolatorFactory = () => Interpolator;
```

`linearInterpolator(durationMs = 80)` and `noneInterpolator` ship in core. Semantics that a custom interpolator MUST honor (spec §13): `shift` moves current and target together without restarting the ease; `settled: true` lets the scheduler stop its rAF loop — a spring that never reports settled pins the loop (bug).
- `packages/dom` `DomBindingOptions.interpolatorFactory?: InterpolatorFactory` — the injection point.
- `packages/react` `LiveCursorProvider` accepts `bindingOptions` (captured once per client — changing it later does NOT rebuild the binding; see `provider.tsx`). **Consequence: switching styles at runtime must recreate the binding or the provider key** — the simplest correct approach is keying the provider subtree on the selected style so it remounts (cursor state is server-side; a remount only re-resolves).
- `apps/demo/src/cursors/setup.ts` — client/provider wiring; `apps/demo/src/components/dashboard/settings-dialog.tsx` — the natural UI home for the switcher; `apps/demo/src/cursors/CursorLayer.tsx` — renderer (unchanged).
- Docs: `docs/react.md` (custom rendering section) and `docs/concepts.md` — where the "bring your own interpolator" recipe belongs.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Demo typecheck | `cd apps/demo && bunx tsc --noEmit` | exit 0 |
| Demo build | `cd apps/demo && bunx vite build` | success |
| Full gate | `bunx vitest run && bunx playwright test` | green / 0 failed |

## Scope

**In scope**: `apps/demo/src/cursors/interpolators.ts` (create), `settings-dialog.tsx` or topbar (switcher UI), the provider wiring file (keyed remount), `docs/react.md` + `docs/concepts.md` (recipe, STE style), `apps/demo/README.md` (one line).
**Out of scope**: `packages/*` — any file. Persisting the choice beyond the session (a URL param `?interp=` is allowed, localStorage is not needed).

## Git workflow

Branch `advisor/007-interp-styles`; plain messages, no AI mention; no push unless instructed.

## Steps

### Step 1: Demo spring interpolator

`apps/demo/src/cursors/interpolators.ts`: `springInterpolator(stiffness = 170, damping = 26): Interpolator` — semi-implicit Euler on x/y with velocity state; `target` retargets WITHOUT resetting velocity; `shift(dx,dy)` displaces current AND target (velocity unchanged); `sample` advances by clamped dt (cap 64ms), sets `settled` when |velocity| and |target−current| are under thresholds (e.g. 0.05 px). Also export a small registry: `{ none, linear, spring }` mapping style ids to factories, reusing `noneInterpolator`/`linearInterpolator` imported from `@anchor-presence/core`.

**Verify**: `cd apps/demo && bunx tsc --noEmit` clean.

### Step 2: Switcher UI + keyed remount

Read the current style from `?interp=` (default `linear`). Settings dialog gets a three-option radio row ("Cursor motion: none / linear / spring"); selecting updates the URL param (pushState, matching `usePageRoute.ts`'s pattern) and a state value. Pass `bindingOptions={{ interpolatorFactory: registry[style] }}` and `key={style}` at the provider (or the component that owns it) so a style change remounts the binding cleanly.

**Verify**: build clean; `bunx vite dev` smoke — switching styles visibly changes remote-cursor motion (use two windows), no console errors.

### Step 3: e2e guard (cheap)

Add one chromium-only Playwright case (in `e2e/cross-layout-chromium.spec.ts` or a new file): open a pair with `?interp=spring` on the receiver; sender moves; assert the remote cursor still lands within tolerance of the anchor target (reuse `expectRemoteCursorNear` with a relaxed poll — springs settle slower). This guards "custom interpolator doesn't break resolution", not spring aesthetics.

**Verify**: `bunx playwright test` 0 failed.

### Step 4: Docs recipe

`docs/react.md`: "Custom interpolation" section — the contract (target/shift/sample/settled, the shift and settled rules from Current state, verbatim), a trimmed spring excerpt, and the provider-key remount requirement. STE rules: ≤20/25-word sentences, imperative, no "should/may/might". `docs/concepts.md`: one paragraph pointing there.

**Verify**: `grep -in " should \| may \| might " docs/react.md` → no new matches in the added section.

## Test plan

Step 3's e2e case plus existing suites. No unit tests for the demo spring (demo code, exercised by e2e); if the spring ever moves into a package, unit tests come with that move.

## Done criteria

- [ ] `git diff --stat -- packages` empty
- [ ] Switcher works for none/linear/spring via UI and `?interp=` param
- [ ] `bunx vitest run` green; `bunx playwright test` 0 failed incl. the new spring case
- [ ] Docs recipe present with the settled/shift rules stated
- [ ] `plans/README.md` updated

## STOP conditions

- The `Interpolator` interface turns out to be insufficient for a spring (e.g. `sample` timing makes velocity integration impossible) — this is a core-interface finding; report it, do not extend core.
- The keyed remount visibly drops/duplicates cursors for >1 frame — report; do not switch to mutating the binding in place.

## Maintenance notes

- The spring's settled thresholds gate the scheduler's idle behavior; a reviewer must check settled actually returns true after motion stops (watch the bench page's pass counter go quiet).
- If users later request spring-in-library, the demo implementation plus Step 3's test move into `packages/core` nearly verbatim — that future plan should cite this one.

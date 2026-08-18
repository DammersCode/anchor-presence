# Plan 003: Detect clipped anchors so cursors stop hovering over empty space

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- packages/dom SPECIFICATION.md e2e apps/demo/src/cursors`
> On mismatch with "Current state" excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (touches the resolver hot path and the public `ResolvedCursor` type)
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: bug
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

Confirmed user-reported defect. Reproduction observed with two browser windows: the sender hovers the Delete button of order row ORD-1045 inside the orders table. On the receiver, that row is clipped by an internal scroll container (padding/margins around the scrollable table body), so the button is not visible — but the remote cursor still renders at the resolved point, hovering over empty space. The current behavior is documented in SPECIFICATION.md §10 ("Offscreen and clipped elements still resolve") but the spec also promises applications can customize this ("consumers may clamp or hide via policy") — and today the policy receives no clipping information, so no policy CAN handle it. This plan adds occlusion detection data and wires the demo policy to use it.

## Design (decided — do not redesign)

Research verified three candidate mechanisms:

1. `Element.checkVisibility()` — does NOT account for overflow/scroll clipping. Rejected.
2. `IntersectionObserver` — its `intersectionRect` does account for ancestor clipping, but delivery is asynchronous, which cannot feed the same-frame READ→COMPUTE resolution pass. Rejected as primary; not used.
3. **Clipping-ancestors rect intersection walk** (the approach used by Floating UI's `detectOverflow`): walk up from the anchor element; for every ancestor whose computed `overflow`/`overflow-x`/`overflow-y` is not `visible` (i.e. `auto`, `scroll`, `hidden`, `clip`), intersect the anchor's rect with that ancestor's client rect (padding box). The result is the anchor's *visible rect*. Synchronous, deterministic, testable in jsdom with mocked rects. **Chosen as the core mechanism.**
4. Optional refinement, `hitTest`: `document.elementFromPoint(x, y)` — additionally catches z-index occlusion (a dialog covering the point) and is exact, but only works for in-viewport points and costs one hit test per cursor per frame. **Shipped as an opt-in mode, off by default.**

Seam placement (module design): one new deep module `packages/dom/src/occlusion.ts` with a small interface — the ancestor walk and rect math are implementation, hidden behind:

```ts
export function computeVisibleRect(
  element: Element,
  rect: Rect,
  getRect: (element: Element) => Rect,
): Rect | null;   // null = fully clipped
export function isPointInRect(x: number, y: number, rect: Rect | null): boolean;
```

The resolver consumes it and exposes ONE new fact to callers: `pointVisible: boolean` on `ResolvedCursor` and on the `VisibilityPolicy` input. The default policy behavior is UNCHANGED (still shows clipped cursors) — applications opt in via policy, which preserves spec Invariant 9 (rendering/policy is consumer-controlled) and makes this a non-breaking additive change.

Library does NOT hide clipped cursors itself. The demo's policy will.

## Current state

- `packages/dom/src/resolver.ts:10-32` — the types this plan extends:

```ts
export type ResolvedCursor<TContext = unknown, TUser = unknown> = {
  clientId: string;
  x: number; // receiver viewport px
  y: number;
  visible: boolean;
  anchorId: string | null; // which anchor won, null = viewport tier
  tier: ResolutionTier;
  context?: TContext;
  user?: TUser;
};

export type VisibilityPolicy<TContext = unknown> = (input: {
  presence: CursorPresence<TContext>;
  resolution: { tier: ResolutionTier; anchorId: string | null };
}) => "show" | "hide";

export const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
  resolution.tier === "hidden" ? "hide" : "show";
```

- `resolver.ts:35-51` `findResolvableAnchor` — returns `{ id, element, rect }` for the first connected anchor with `width > 0 && height > 0`; clipping is never considered.
- `packages/dom/src/geometry.ts` — shared `Rect`/`ViewportSize` types (`{ left, top, width, height }`).
- `packages/dom/src/scheduler.ts` — READ phase caches rects via `readState.getRect(element)`; `getRect` measures on demand and caches per frame. The occlusion walk MUST use `readState.getRect` for ancestor rects so ancestor measurements join the same per-frame cache (spec §11: batch reads, measure once per frame).
- `apps/demo/src/cursors/visibilityPolicy.ts` — demo policy (settings-dialog rule + page rule); the pattern to extend.
- `apps/demo/src/cursors/PresencePill.tsx` — where the demo shows per-user indicators (pattern for an "out of view" hint).
- `e2e/helpers.ts` — `openPair`, `moveToAnchor`, `expectRemoteCursorNear` helpers; `e2e/cross-layout-chromium.spec.ts` — chromium-only scenario pattern to model new tests after.
- SPECIFICATION.md §10 documents current clip behavior; §10.1 defines the policy contract. Spec governs: any protocol/public-type change needs the spec updated in the same commit.
- Repo conventions: TypeScript strict; comments max one short line, only non-obvious whys; tests via `bunx vitest run --project dom`; jsdom has no layout so tests mock `getBoundingClientRect` and `getComputedStyle`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | exit 0 |
| Dom unit tests | `bunx vitest run --project dom` | all pass |
| All unit tests | `bunx vitest run` | all pass |
| Browser tests | `bunx playwright test` | 0 failed |
| One e2e file | `bunx playwright test e2e/occlusion.spec.ts` | 0 failed |

## Scope

**In scope**:
- `packages/dom/src/occlusion.ts` (create), `resolver.ts`, `binding.ts` (thread the option + data), `index.ts` (exports)
- `packages/dom/test/occlusion.test.ts` (create), `resolver.test.ts` (extend)
- `SPECIFICATION.md` §10/§10.1 (document `pointVisible`, the clip-walk, and the opt-in `hitTest` mode)
- `apps/demo/src/cursors/visibilityPolicy.ts`, `PresencePill.tsx` (demo opt-in: hide clipped cursor + "out of view" indicator)
- `e2e/occlusion.spec.ts` (create), `e2e/helpers.ts` (additive helpers only), `apps/demo` data-testid additions if strictly needed
- `docs/troubleshooting.md`, `docs/ui-context.md` (short additions)

**Out of scope**:
- `packages/core` — occlusion is geometry; core stays DOM-free (spec Invariant 6/boundary tests enforce this).
- Changing the DEFAULT policy to hide clipped cursors — explicitly a consumer decision.
- Auto-scrolling the receiver to reveal the element — spec §12 forbids forcing receiver UI state.
- IntersectionObserver-based implementation.

## Git workflow

- Branch: `advisor/003-occlusion`
- Commit per step. Plain messages, no AI mention.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Build the red feedback loop FIRST (failing e2e test)

Before any implementation, create `e2e/occlusion.spec.ts` (chromium-only, model after `e2e/cross-layout-chromium.spec.ts`): sender+receiver pair; make the receiver's orders-table body scroll container small (set the receiver viewport height to ~500px so later rows are clipped by the internal scroll area — inspect the demo's table markup to find the scrollable element; if the table body does not actually scroll internally at small heights, force it via `page.addStyleTag` with a max-height+overflow on the table wrapper, which is legitimate test setup, not app code). Sender points at a row that IS visible for the sender but clipped for the receiver. Assert: the receiver's remote cursor element is hidden (`toHaveCount(0)` or hidden state) once the demo policy from Step 5 exists. Run it now.

**Verify**: `bunx playwright test e2e/occlusion.spec.ts` → the new assertion FAILS (cursor is visible over empty space). This red run is the reproduction of the user's report. Keep the test; it goes green at Step 5.

### Step 2: Implement `occlusion.ts`

`computeVisibleRect(element, rect, getRect)`: walk `element.parentElement` up to (excluding) `document.documentElement`; skip ancestors whose computed overflow values are all `visible`; for clipping ancestors intersect `rect` with the ancestor rect from `getRect(ancestor)`; return `null` when the intersection is empty. Cross shadow boundaries via `(root as ShadowRoot).host` like `registry.ts` does. Read computed style once per ancestor via `getComputedStyle`; accept an injectable `getComputedStyle` parameter (default `window.getComputedStyle`) for jsdom tests. `isPointInRect` is a 3-line helper.

**Verify**: `bunx vitest run --project dom` still green (new module unused yet), typecheck clean.

### Step 3: Thread `pointVisible` through the resolver

- `ResolvedCursor` gains `pointVisible: boolean` (true on viewport tier and when no clipping ancestor exists).
- `VisibilityPolicy` input `resolution` gains `pointVisible: boolean`.
- In the resolution path (anchor tier only): after computing x/y, `pointVisible = isPointInRect(x, y, computeVisibleRect(element, rect, getRect))`.
- `defaultVisibilityPolicy` is UNCHANGED.
- Optional mode: `ResolverOptions`/`DomBindingOptions` gain `hitTest?: boolean` (default false). When true and the point is within the viewport, refine with `document.elementFromPoint(x, y)`: `pointVisible &&= element.contains(hit) || element === hit || (composed path contains element)`. Guard for jsdom (`document.elementFromPoint` may be missing — treat as no refinement).

**Verify**: typecheck clean; `bunx vitest run` — expect ZERO failures (additive change; if an existing test fails, the change was not additive — fix before proceeding).

### Step 4: Unit tests

`packages/dom/test/occlusion.test.ts` (mocked rects + stub `getComputedStyle`):
- no clipping ancestors → full rect returned
- one `overflow: auto` ancestor partially clipping → intersected rect
- fully scrolled-out element → `null`
- the reported case: anchor inside scroll container whose padding leaves the anchor rect measurable but the point outside the visible sub-rect → `isPointInRect` false
- nested clipping ancestors (two levels) → intersection of all
- `overflow: visible` ancestors ignored

`resolver.test.ts` additions: `pointVisible` true/false surfaces on `ResolvedCursor` and reaches the policy input; `hitTest: true` refinement consulted when `elementFromPoint` present.

**Verify**: `bunx vitest run --project dom` all green, ≥7 new tests.

### Step 5: Demo opt-in + spec + docs

- Demo `visibilityPolicy.ts`: add `if (!resolution.pointVisible) return "hide"`.
- `PresencePill.tsx`: when a remote user's cursor was hidden for this reason, show a small "out of view" text hint (text nodes only). Simplest wiring: the pill already receives resolved cursors/presences — follow the existing "in Settings" indicator pattern.
- SPECIFICATION.md: §10 gains the clip-walk paragraph + `pointVisible` in the ResolvedCursor shape; §10.1 the new policy input; note `hitTest` mode and its viewport-only limitation.
- `docs/troubleshooting.md`: entry "cursor floats over empty space" → clipped anchor, `pointVisible`, policy recipe. `docs/ui-context.md`: policy example.

**Verify**: `bunx playwright test e2e/occlusion.spec.ts` → GREEN (the Step 1 red test now passes). Then full `bunx playwright test` → 0 failed.

### Step 6: Precision test matrix (user-requested)

Add to `e2e/occlusion.spec.ts` (or a sibling `e2e/precision.spec.ts`): a u/v grid sweep — sender points at (0.1,0.1), (0.5,0.5), (0.9,0.9) of `stats.revenue` across mismatched viewports (1280×720 vs 1920×1080); assert receiver position within ±2px of `receiverRect(u,v)` for each point (poll with `expect.toPass` to let the 80ms interpolation settle). This pins normalization precision, not just "roughly over the element".

**Verify**: `bunx playwright test` → 0 failed, new precision cases listed in the report.

## Test plan

Summarized in Steps 1, 4, 6: one red-first e2e reproduction of the user's exact symptom, ≥7 unit tests on the clip math (including the padding case from the report), resolver/policy threading tests, and a ±2px u/v precision matrix. Model e2e code on `e2e/cross-layout-chromium.spec.ts`; model unit tests on `packages/dom/test/resolver.test.ts`.

## Done criteria

- [ ] `bunx tsc --build packages/core packages/dom packages/react` exit 0
- [ ] `bunx vitest run` all green with the new occlusion/resolver tests present
- [ ] `bunx playwright test` 0 failed, including `e2e/occlusion.spec.ts` (was red at Step 1) and the precision matrix
- [ ] `grep -n "pointVisible" SPECIFICATION.md` ≥ 2 matches (spec updated)
- [ ] Default policy unchanged: `grep -A2 "defaultVisibilityPolicy" packages/dom/src/resolver.ts` still only checks `tier === "hidden"`
- [ ] `packages/core` untouched: `git diff --stat -- packages/core` empty
- [ ] `plans/README.md` updated

## STOP conditions

- Step 1 cannot produce a red test (the clipped scenario is not reproducible in the demo) — report with screenshots; do not fake the repro with app-code changes.
- The clip walk measurably breaks the frame budget in `apps/demo` bench (`?page=bench`, 100 cursors × 1000 anchors regressing from ~1.5ms to >2ms mean) — report numbers; a caching redesign is out of scope.
- Threading `pointVisible` forces a change in `packages/core` types — the seam is wrong; report.
- jsdom's `getComputedStyle` behavior makes the injectable-parameter approach unworkable — report rather than switching to module mocks.

## Maintenance notes

- `hitTest` mode also catches dialog-overlay occlusion; if users later ask for "hide cursor behind modals" point them there instead of a new mechanism.
- If a future plan adds `position: sticky` table headers to the demo, the clip walk treats the sticky header's overlap as NOT clipping (it is z-occlusion, only `hitTest` sees it) — known limitation, document if it bites.
- Reviewer scrutiny: the ancestor walk must use `readState.getRect` for every rect so per-frame read batching holds (spec §11); a raw `getBoundingClientRect` in the walk is a layout-thrash regression.

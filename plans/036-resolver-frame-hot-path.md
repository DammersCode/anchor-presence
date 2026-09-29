# 036 Resolver frame hot path

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: zero per-frame and per-cursor allocations while remote cursors ease.

## Changes

- `packages/core/src/interpolate.ts`: add an optional `sampleInto(out: { x: number; y: number; settled: boolean }): void` to `Interpolator` (JSDoc: samples into `out` without allocating; `sample` stays the allocating default). Implement it on `noneInterpolator` and `linearInterpolator` (mirror `sample`'s logic, write into `out`).
- `packages/dom/src/resolver.ts`:
  - Hoist to `RemoteResolver` instance fields, cleared per `resolveAll` pass: the active-ids `Set`, the results array, the active-anchors `Set`, the visible-rect memo `Map`, the returned anchor list array.
  - Split geometry resolution: an internal `resolveGeometryInto(presence, registry, readState, memo, out, outAnchors)` fills a scratch `RawResolution` and scratch anchor array; the public `resolveGeometry` becomes a thin allocating wrapper (still used by `packages/dom/test/resolver.test.ts` and `apps/server/test/adversarial.test.ts`).
  - Hoist the visibility-policy input object and its nested `resolution` object; the policy is called synchronously per cursor, so one pass-scoped pair is safe (cast at the call site).
  - `InterpolatorState` gains a `sampleBox`; the loop uses `sampleInto(sampleBox)` when present and `sample()` otherwise.
  - The identity rule stays: unchanged cursors keep result-object identity (spec §14.1); the hoisted arrays never escape with stale content because each pass clears and refills them.

## Verify

- Gates 1-6. `packages/dom/test/resolver.test.ts` (identity + geometry) must stay green. Check the manual demo bench page (`?page=bench`) before/after — no CI gate covers it.

## Commit

`hoist the resolver's per-frame containers`

# 035 Pointer hot path, touch clear, and focus capture

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: the pointer path stops walking the DOM on every move; touch cursors no longer stick; keyboard focus can publish a cursor; a presence-only mode exists.

## Changes

- `packages/dom/src/registry.ts`: add a `generation` counter, incremented in `notifyChange`; expose `getGeneration(): number` on the `AnchorRegistry` interface (internal type, not in the public index).
- `packages/dom/src/pointer.ts`:
  - Shared `PointerInfo` constants per pointer type (module-level object), so a move never allocates pointer info.
  - Cache the anchor chain per target element: `cachedTarget` + `cachedChain` (already sliced to `maxAnchors`) + `cachedGeneration`; recompute only when the target element or the registry generation changes. `buildCursorPosition` takes the chain instead of the registry. One-line ponytail comment: the `composedPath` call still runs per move (shadow retargeting needs it); only the registry walk is cached.
  - Track `activeTouchPointers: Set<number>`; on `pointerup`/`pointercancel` with `pointerType === "touch"`, delete the id and call `client.updateLocalCursor(null)` when the set empties.
  - New option `captureFocus?: boolean` (default `false`): `focusin` publishes a cursor at the focused element's center (rect from `getCachedRect` with a live-rect fallback; skip non-measurable elements; no `pointer` info); `focusout` clears the cursor when `document.activeElement` is `null` or `body`. Remove the listeners in `detach`.
- `packages/dom/src/binding.ts`:
  - `DomBindingOptions` gains `localCursorCapture?: boolean` (default `true`; `false` attaches no pointer source at all — presence-only: context and user still flow) and `captureFocus?: boolean` (default `false`; only applied when `localCursorCapture` is not `false`).
  - `PointerSourceOptions` gains `captureFocus?`.

## Verify

- Gates 1-6. The existing e2e suite (cross-layout, occlusion, resilience) exercises the pointer path and must stay green.

## Commit

`cache the anchor chain per target and clear touch cursors`

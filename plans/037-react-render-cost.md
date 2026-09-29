# 037 React render cost and cursor z-index

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: stop per-move render allocations in the React layer, and lift cursors above modals by default.

## Changes

- `packages/react/src/cursor.tsx`:
  - `DEFAULT_Z_INDEX` from `50` to `9999` (a normal stacking context keeps the cursor above app chrome; a top-layer `dialog` still wins, which is why the demo dialog becomes an overlay in step 038).
  - `CursorLayerProps` gains `zIndex?: number`, forwarded to `CursorItem` and applied in the style object before the consumer style spread (consumer style still wins).
  - `prefersReducedMotion` reads one module-level `MediaQueryList` with a single `change` listener that updates the cached boolean; the render path is a plain variable read. Keep the SSR-safe guard (no `window` at import or render).
- `packages/react/src/hooks/use-remote-users.ts`: replace `projectRemoteUsers` with an in-place projection: keep the persistent `byClientId` map across probes; compare each client's `user`/`idle`/`session` against the stored entry without allocating; replace the entry only on a real change; rebuild the `users` array only when membership/order or a user field changed, otherwise return the previous array reference. Result: zero allocations on cursor-only messages.

## Verify

- Gates 1-6 (react package changes; run Playwright).

## Commit

`raise the default cursor z-index and stop per-move render allocations`

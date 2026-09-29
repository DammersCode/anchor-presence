# 034 O(1) active-cursor count in the store

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: the scheduler's "is any remote cursor active?" check stops rebuilding the raw O(N) snapshot on every inbound message.

## Changes

- `packages/core/src/store.ts`: add `private activeCursorCount = 0`. Maintain it: new entry with a non-null cursor (+1), cursor null-to-non-null or non-null-to-null transition on update (compute before replacing `existing.presence`), entry deleted in `sweep` or `remove` with a non-null cursor (-1). Add `hasActiveCursors(): boolean` (returns `activeCursorCount > 0`), JSDoc: O(1), the store keeps the count.
- `packages/core/src/internal/types.ts`: add `hasActiveCursors?(): boolean` to `PresenceClient` (optional — custom client implementations may omit it).
- `packages/core/src/client.ts`: expose `hasActiveCursors() { return state.store.hasActiveCursors(); }`.
- `packages/dom/src/binding.ts`: `hasActiveCursors: () => client.hasActiveCursors?.() ?? client.getRemoteSnapshot().some((presence) => presence.cursor !== null)`.
- `packages/core/test/store.test.ts`: counter tests — ingest with cursor counts 1, a message with `cursor: null` drops to 0, `sweep` of a stale entry with a cursor decrements, `remove` decrements.

## Verify

- Gates 1-6 (dom package changes; run Playwright).

## Commit

`count active remote cursors in the store`

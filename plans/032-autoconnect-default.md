# 032 Default autoConnect to true

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: a client connects by default. Omitting `autoConnect` no longer produces a silently inert client.

## Changes

- `packages/core/src/client.ts`: `if (options.autoConnect === true)` becomes `if (options.autoConnect !== false)`; update the `createPresenceClient` JSDoc (the client connects the transport itself by default; `autoConnect: false` leaves the call to the caller).
- `packages/core/src/internal/types.ts`: update the `autoConnect` JSDoc (`@default true`, and the example drops the now-redundant flag).
- `packages/core/test/client.test.ts`: flip the `autoConnect` describe block — omitted: `connect()` called exactly once after subscribe; `false`: never called; the no-`connect` transport case stays.

## Verify

- `bun run build && bun run typecheck && bun run lint && bun run test` (core only, skip Playwright).

## Commit

`default autoConnect to true`

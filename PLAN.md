# Implementation Plan

Source of truth for design decisions: SPECIFICATION.md (v1.1). This plan sequences the work.

## Tooling decisions (fixed)

- Bun workspaces. Packages under `packages/*`, apps under `apps/*`.
- TypeScript strict, ESM only, `tsc` builds with `exports` maps and `.d.ts`.
- Vitest for unit tests (node env for core, jsdom for dom/react).
- Playwright for cross-layout browser tests (Chromium, Firefox, WebKit).
- Demo: Vite + React + Tailwind v4 + shadcn-style components (hand-rolled with Tailwind; no component-CLI dependency).
- Git worktrees for parallel worker isolation; integration happens on `main`.

## Phases and tasks

Each task lists: objective, files, dependencies, tests, acceptance.

### Phase 0 — Scaffold (sequential, small)

T0 Monorepo scaffold.
- Files: root `package.json` (workspaces), `tsconfig.base.json`, per-package `package.json`/`tsconfig.json`, `vitest.config.ts`, `.gitignore`.
- Tests: `bun install` succeeds; `tsc --noEmit` passes on empty packages.

### Phase 1 — Core (worker A)

T1 Protocol types + validation (`packages/core/src/protocol.ts`, `validate.ts`).
- `CursorPresence`, `AnchorPoint`, `CursorPosition`, limits table from spec §4.2, `validatePresence(input: unknown): CursorPresence | null` with clamping and field-drop rules.
- Tests: validation table (each limit), clamping, truncation to 8 anchors, oversize context/user drop.

T2 Sequencing + presence store (`store.ts`).
- Per-clientId `(session, lastSequence, lastSeenAt)`; rules from §4.3; `maxRemoteClients` cap; stale sweep; immutable `getSnapshot()`; `subscribe()`.
- Tests: session reset, stale drop, out-of-order drop, cap eviction behavior (drop new), expiry with injected clock, duplicate clientId across sessions.

T3 Codec + transport types (`codec.ts`, `transport.ts`).
- `jsonCodec` (never throws past decode → returns null/unknown), `LiveCursorTransport`, `ConnectionStatus`.
- Tests: round-trip, malformed bytes, truncated JSON.

T4 Client orchestration (`client.ts`).
- `createPresenceClient(options)`: latest-state slot, rate-limited publisher (injected scheduler), heartbeat, status wiring (constant "connected" fallback), `setContext`, `dispose()`.
- Tests: fake-timer publish rate, latest-wins, heartbeat, dispose stops everything, no send while disconnected status.

Acceptance for Phase 1: zero DOM/React/transport imports (checked by a test that imports the package in plain node), all unit tests pass.

### Phase 2 — DOM (worker B, after Phase 1 interfaces exist)

T5 Anchor registry (`packages/dom/src/registry.ts`).
- §8: register/unregister function identity, new-element-wins + dev warn, `isConnected` staleness, ancestors() with forward-map cross-check.
- Tests: mount/unmount/remount, duplicates, stale entries, ancestors ordering.

T6 Pointer capture + outbound sampling (`pointer.ts`).
- §9: composedPath, ancestor anchor collection, fallback chain (max 4), normalization, viewport fallback, leave/blur → null cursor.
- Tests (jsdom): chain building, nested anchors, zero-size skip, leave handling.

T7 Geometry scheduler (`scheduler.ts`).
- §11: invalidate → coalesced rAF, read/compute/notify phases, signal wiring (resize, capture scroll, ResizeObserver, MutationObserver, transition tracking with safety timeouts, infinite-animation short window), idle teardown.
- Tests: coalescing (mock rAF), one-measure-per-anchor-per-frame, idle = no rAF, listener/observer cleanup on dispose, transition window closes on cancel/timeout.

T8 Remote resolver + visibility policy (`resolver.ts`).
- §10: tier walk, measurable check, ResolvedCursor output, default policy, policy override, interpolation integration with snap-on-local-invalidation.
- Tests: tier fallback order, hidden tier, policy override, snap vs target paths.

### Phase 3 — React + interpolation (worker C, after Phase 2 interfaces)

T9 Interpolators (`packages/core/src/interpolate.ts` — math only, DOM-free).
- `none`, `linear` with snap; tests for easing math and settled flag.

T10 React adapter (`packages/react/src`).
- §14: provider, six hooks, useSyncExternalStore wiring, SSR server snapshots, stable ref callback.
- Tests: strict-mode double mount, snapshot subscription, SSR render (renderToString), rerender isolation.

### Phase 4 — Demo + server (worker D, parallel with Phase 3)

T11 Bun relay (`apps/server/index.ts`): room broadcast, ~50 lines, no message inspection.
T12 Demo dashboard (`apps/demo`): Vite React TS, Tailwind, shadcn-style admin dashboard (collapsible sidebar, topbar, stat cards, orders table with per-row anchors, settings dialog), `WebSocketTransport` example, colored SVG cursor renderer with text-node name labels, anchors registered via `useCursorAnchor`.
- Acceptance: two browser windows at different sizes/sidebar states show semantically correct cursors.

### Phase 5 — Cross-layout browser tests (worker E, after 2-4)

T13 Playwright harness: two pages against one relay; scenarios from spec §17 (viewport sizes, sidebar mismatch, flex wrap, element-size proportionality ±2 px, dialog context policy, receiver-scroll reposition without packets).

### Phase 6 — Bench, docs, hardening (worker F + Reviewer)

T14 Benchmark page in demo (`/bench`): scripted cursor/anchor matrices from §16, reports ms/pass.
T15 Docs: `docs/` per spec documentation list + package READMEs (STE style).
T16 Reviewer pass (separate agent, mattpocock code-review skill) + fixes. Production checklist sweep.

## Parallelization

- Worker A (core) runs first; its `src/*.ts` interfaces unblock B and C.
- B (dom) and D (demo shell + server) run in parallel worktrees.
- C (react) starts when dom's public API lands; D consumes C's package when merged.
- E and F run after integration.

## Integration gates

After each phase: `bun install && tsc --noEmit (all packages) && vitest run`. No phase merges with red tests.

## Risks

- jsdom lacks real layout: geometry tests use mocked `getBoundingClientRect`; real layout correctness is owned by the Playwright suite.
- ResizeObserver/MutationObserver absent in jsdom: injectable observer factories in scheduler options.
- Tailwind v4 + Vite churn: pin versions in demo.
- Windows dev environment: Playwright webServer must launch Bun relay + Vite; use `npm-run-all`-free plain scripts.

# Task: NEXT wave — Perf (K2/K3), Test-Gaps, Bench-Fix, Relay-Auth, JSDoc, Lint-Batch

Status (2026-09-03): ALL ITEMS DONE (1-7). dev @ 284ff01, 406/406 tests, 0 lint warnings.
Report: .agent/reports/next-wave.md. Remaining: K4 broker (LATER), K22 (P3, documented),
push decision (user).

Work in `C:\repos\danny\anchor presence`, branch `dev` (unpushed; check `git log --oneline -5`
on start — the audit round ends at the "merge K13 fix" merge commit).

Repo: Bun/TS monorepo for semantic live cursors over the DOM.
Packages: `core` (protocol/validation/store/client/codec, zero runtime deps, DOM-free),
`dom` (registry/pointer/scheduler/resolver + WebSocket transport), `react` (adapter),
`apps/server` (Bun WebSocket relay), `apps/demo`, `examples/{socketio,signalr}`.
State at start: build/typecheck/lint/test all green, 381 tests, 0 lint errors (167 warnings).

## Read first (context, in this order)

1. `.agent/reports/roadmap.md` — this wave is its section NEXT 1-6.
2. `.agent/insight-memory/known-issues.md` — item IDs K1-K22 + status.
3. `.agent/benchmarks/perf.md` — measured perf findings + scaling model.
4. `docs/transports.md` + `docs/security.md` — relay env vars and close codes 4001-4005.

## Work items (in priority order; all on `dev`, single agent)

### 1. K2 — presence re-render per inbound message (P1, MEASURED)

Facts: `useCursorPresence` consumers re-render once per accepted inbound message
(`packages/core/src/store.ts` notification path + `packages/react/src/hooks.ts`);
the demo pill pays ~O(20*m^2) React work/s. `useRemoteCursorsSelector` already
exists for cursor-based consumers.

Work:
- (a) Document the selector-based pattern in the react package README / `docs/react.md`
  (one short section: which hook for which consumer, render cost of each).
- (b) Evaluate a snapshot-stability optimization: does the store re-emit when an accepted
  ingest changes nothing the consumer can observe? If yes, make the snapshot stable
  (content-based) so `useSyncExternalStore` dedupes. Keep `sequence` observable where
  required (tests may rely on it).
- Only ship (b) if a measured improvement is real; otherwise document the guidance
  and mark K2 as P3-with-docs.

Acceptance: a re-render isolation test (pattern: `packages/react/test/rerenderIsolation.test.tsx`)
showing no re-render when content is unchanged; before/after numbers in a new
`.agent/benchmarks/perf-k2.md`; docs updated.

### 2. K3 — sender pointermove reflows (P1, INFERRED — measure FIRST)

Facts: while the scheduler is dirty (scroll/transition in flight), pointermove falls back
to live `getBoundingClientRect` (`packages/dom/src/pointer.ts:46`,
`packages/dom/src/scheduler.ts:397`) -> synchronous reflows at pointer frequency.

Work:
- Step 1 MEASURE: small browser bench (playwright, `e2e/` or a throwaway spec in a temp
  dir) — scrolling page + moving pointer, 20 senders worth of pointermove; record frame
  time / reflow cost with and without active scroll. Write numbers to
  `.agent/benchmarks/perf-k3.md`.
- Step 2: if the numbers are not significant, downgrade K3 to P3 in
  `.agent/insight-memory/known-issues.md` with the evidence and STOP.
- If significant: cache rects until the scheduler is clean (rect cache keyed by element,
  invalidated by the scheduler's existing invalidation), red->green test.

Acceptance: perf-k3.md exists with hard numbers; either the fix + tests or a documented
downgrade. No performance claim without a measured number.

### 3. Test gaps (all additive, no behavior change)

- Adversarial e2e over the REAL relay (pattern: `apps/server/test/relay.test.ts` raw-TCP
  helper): junk frames (truncated/invalid UTF-8, unknown protocol version), oversized
  messages (32 KiB boundary, multibyte), flood (rate-limit behavior), malformed room
  names, spoofed sequence (must be rejected by the client, relay just relays), and
  Invariant 8 end-to-end: an anchor ID never registered on the receiver must not
  resolve to any DOM element.
- Stale-sweep e2e: a peer goes silent for `staleTimeoutMs` (lower via test env/injection)
  -> its cursor disappears for the other peer.
- `binaryCodec` encode-side throw paths: `context`/`user` values that break
  `JSON.stringify` (cycles are already caught by validation; cover what encode itself
  can hit) -> no uncaught throw, graceful skip/error. Check
  `packages/core/src/binaryCodec.ts` for the actual failure surface first.

Acceptance: all new tests green, stable across 3 consecutive full runs (no flake).

### 4. BenchPage self-contamination

Facts: `apps/demo/src/pages/BenchPage.tsx` (~lines 59-63) re-renders stats at 60 Hz and
contaminates its own 1000-anchor measurement.

Work: throttle stats updates (1 Hz is enough) or add a "no-stats" mode; note the fix in
`docs/performance.md` where the bench is documented.

Acceptance: bench numbers measurably more stable (lower run-to-run variance) or
documented why not; docs updated.

### 5. Relay auth hook (protocol-adjacent -> run a mini-advisory inside this item)

Goal: opt-in auth on room join without breaking the current demo (no auth configured =
exactly today's behavior).

Mini-advisory (write it into the item's report section, keep it short):
- Option A: static token via env (`RELAY_AUTH_TOKEN` set = require `?token=...` match).
- Option B: HMAC-signed room token (more code, no key on the wire).
- Option C: external validation webhook (overkill for a reference relay).
Pick the simplest that serves the "app-level auth" goal (expect Option A); document the
tradeoff in one paragraph.

Work: server validates the token during upgrade (new close code 4006 for bad/missing
token when auth is enabled); `createWebSocketTransport` in `packages/dom/src/transport.ts`
gains an optional `token` option (additive, URL or header per what the server reads);
docs: `docs/transports.md` (env var + code 4006) and `docs/security.md` (auth is
app-level; token is not a presence credential).

Acceptance: tests for no-auth (old behavior), correct token, wrong/missing token
(auth enabled); full gate green.

### 6. Lint batch (167 warnings, 0 errors)

Mechanical fixes only (no behavior changes): `unicorn/prefer-dom-node-append`,
`vitest/no-conditional-in-test` (split into separate `it` cases where the rule wants it),
`unicorn/prefer-at`, `prefer-dom-node-dataset`, `no-useless-undefined`, etc. — run
`bun run lint` for the live list. Test files first (bulk of the warnings), then src.

Acceptance: `bun run lint` reports 0 warnings, or a documented residual list with reasons
(e.g. a rule that is wrong for the case) in the wave report. Tests green.

### 7. JSDoc for all public APIs (simple English, ASD-STE100)

Every public export of `core`, `dom`, and `react` gets a high-quality JSDoc block
written in simple English per the `simple-english` skill (ASD-STE100): sentences of
20 words or fewer, one word one meaning, plain words, active voice, condition
before command.

Work:
- Source of truth for "public": the three pin tests
  (`packages/core/test/publicApi.test.ts`, `packages/dom/test/publicApi.test.ts`,
  `packages/react/test/publicApi.test.ts`) + the `src/index.ts` of each package.
- For every exported symbol (functions, classes, hooks, components, types,
  interfaces, option objects, constants): a JSDoc block with 1-3 short sentences
  of what it does or what it represents, then tags where useful
  (`@param`, `@returns`), then a short note ONLY for non-obvious constraints
  (e.g. "This method drops messages that are older than the stored sequence."
  "The transport never reconnects after dispose."). No implementation narration,
  no process commentary, no em-dash characters.
- Comments must still obey the repo rule: one idea, short. JSDoc is the
  exception that is allowed to be 1-3 sentences.
- ZERO code changes: comments only. Every test must pass unchanged.
- Include the new APIs of this wave (stable presence snapshot, relay token
  option, auth close code 4006 in docs only if present in code).

Acceptance: all public exports have JSDoc; the sentence-length rule holds
(20 words max per sentence, verifiable by reading); full gate green.

## Rules

- One logical commit per fix, fine-grained, single-line imperative message
  (match `git log --oneline -15` style). NEVER add `Co-Authored-By` or any
  attribution trailer.
- Full gate after every commit: `bun run build && bun run typecheck &&
  bun run lint && bun run test`. Do not land a red gate.
- Additive public API only. No new runtime dependencies. No public API breaks.
- Do NOT push. Do NOT touch `.agent/` files except the ones named above.
- If you need OSS source code: `git clone --depth 1 <url> oss-refs/<name>`
  (see `oss-refs/README.md`; tldraw = reference-only, never copy code).
- If an item turns out wrong/downgraded: record why in
  `.agent/insight-memory/known-issues.md` and keep going.
- If blocked on an item: write what blocks in `.agent/insight-memory/active-investigations.md`,
  finish the remaining items, report at the end.

## Definition of done

- All 6 items done (commits + tests) OR explicitly downgraded/rejected with documented rationale.
- Full gate green on `dev`; test count above 381; lint warnings lower than before.
- `.agent/reports/next-wave.md` written: per item — what changed, measured numbers,
  commit hashes, acceptance evidence; plus a short "next ideas" list.

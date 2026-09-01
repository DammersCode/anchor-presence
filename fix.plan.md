# Fix Plan — validated findings → worktree workstreams

Source: review.validation.md (26 findings; 0 false-positives). Grouped by root cause, cut so parallel work has no file overlap. All work lands on `dev` (merge to `main` = deliberate CI trigger, user-controlled).

Sequencing: **WS-1 first** (it introduces the core API surface WS-2/WS-3 build on), then **WS-2 ∥ WS-3** in parallel worktrees. Docs/spec reconciliation as a final advisor pass.

## WS-1 — core: publish model, lifecycle, status contract
Files: `packages/core/src/{client,transport,protocol}.ts`, core tests, `docs/transports.md`, SPECIFICATION.md §5/§7.
Findings: C-1, C-2, C-9, M-C-1 (Group A) · C-6, M-C-3 (Group B) · C-5, C-8 + registerTeardown-unregister (Group C core) · C-3 (Group D) · C-7, M-C-2, C-4 core half · R-1 core half.

1. **Dirty-flag publish model** (A): replace the `latestCursor !== lastSentCursor` identity guard with an explicit `pendingPublish` dirty flag set by `updateLocalCursor`, `setContext`, `setUser`, reconnect, and failed sends (re-arm on failure). Treat `"reconnecting"` as unsendable in `send()`; republish on every transition into `"connected"`.
2. **Readable context/user** (R-1 core): add `getContext(): TContext | undefined` (and `getUser()`) to `PresenceClient`. ⚠ interface addition — breaking only for third-party *implementers* of the interface, not consumers.
3. **Status contract** (C-3, high): document replay-on-subscribe as required in `LiveCursorTransport.subscribeStatus` + spec §5; fix all three doc adapters in docs/transports.md; defensively, keep client at `"connecting"` but document loudly. (Optional additive `getStatus?()` on the transport if cleaner.)
4. **Dispose lifecycle** (C-5, C-8): best-effort `send(null)` at top of `dispose()` while sendable; `registerTeardown` returns an unregister fn (void→fn = additive) and invokes `fn` immediately when already disposed. Emit final `"disconnected"` to status listeners before clearing (core half of R-6).
5. **Guarded fan-out** (C-6, M-C-3): try/catch around the transport subscribe handler body (drop message on error) and around status/store listener loops; run reconnect-republish logic before status fan-out.
6. **Option hygiene** (C-7, M-C-2): clamp `publishIntervalMs`/`heartbeatMs`/`staleTimeoutMs` to sane minimums; dev-mode warning when outbound encoded message exceeds `maxMessageBytes` or context/user exceed `maxFieldBytes`.
7. **Pointer type, core half** (C-4): accept `pointerType` (e.g. optional second arg to `updateLocalCursor` or part of a publish-state setter) and include `pointer: { type }` in `buildMessage`. Additive.

Breaking risk: low — behavior change (no sends during `"reconnecting"`, leave message on dispose) is spec-aligned; API changes are additive.

## WS-2 — dom: render identity, cache discipline, observers
Files: `packages/dom/src/{scheduler,resolver,frameCache,pointer,binding}.ts` (+ index), dom tests.
Findings: R-7, M-D-1, D-2, D-3, D-6 (Group E) · D-1, R-6 dom half (Group C) · D-4, M-D-2 (Group B/F) · C-4 dom half · R-2.

1. **Resolver identity caching** (R-7, spec §14.1): return the previous `ResolvedCursor` instance (and array) when a cursor's resolved values are unchanged, so selector equality works for all `useRemoteCursors*` consumers.
2. **MO self-feedback filter** (M-D-1): ignore MutationObserver records originating inside `[data-anchor-presence-cursor]` roots so cursor transforms stop defeating the interpolation-only reuse path.
3. **Cache discipline** (D-3, D-6): `getCachedRect` returns `undefined` while `dirty`; memoize `getStyle` (and visible rect per anchor element) in the frame cache.
4. **Shadow-root invalidation** (D-2): discover open shadow roots of registered anchors via the registry; attach scroll listeners + MutationObservers per root, detached with the same lifecycle. Keep it simple (roots of registered anchors only); document closed roots as unsupported.
5. **Teardown unregister** (D-1): binding/pointer store the unregister fn from WS-1's `registerTeardown` and call it in their own dispose/detach; binding publishes one final empty snapshot before clearing listeners (R-6 dom half).
6. **Pointer fixes** (D-4, M-D-2, C-4): replace dead `pointerenter` listener with `pointerover` (verified Element target) or drop it; guard `doc.body` before `mutationObserver.observe`; thread `event.pointerType` into the client (WS-1 API).
7. **Name collision** (R-2): rename dom's `DEFAULT_MAX_ANCHORS` → `DEFAULT_MAX_SENT_ANCHORS`, keep deprecated alias export.

Breaking risk: low — rename shipped with alias; everything else internal or additive.

## WS-3 — react + docs
Files: `packages/react/src/{contextStore,hooks,index}.ts`, `docs/react.md`, `docs/ui-context.md`, `docs/troubleshooting.md`.
Findings: R-1 react half · R-4 · R-5 · D-5 (docs).

1. **Context mirror** (R-1): seed the context store from `client.getContext()` and keep it in sync (poll-free: read through to the client instead of mirroring, now that core is readable).
2. **Type re-exports** (R-4): re-export `ResolvedCursor`, `ResolutionTier`, `PresenceClient`, `CursorPresence`, `ConnectionStatus`, `DomBinding`, `DomBindingOptions` from `@anchor-presence/react`.
3. **Docs** (R-5, D-5): add `pointVisible` to the documented hook shape; document the containing-block/occlusion limitation next to the clippedPointPolicy recipes.

Breaking risk: none (additive + docs). Depends on WS-1 (`getContext`).

## WS-4 — quality phase (after WS-1..3 merge; user-requested 2026-09-01)

Goal: production-ready, high-quality code AND documentation, enforced by tooling where possible.

1. **Lint enforcement (oxlint):** research done (scratchpad/oxlint-research.md, 2026-09-01). Adopt oxlint 1.80 + oxlint-tsgolint (type-aware is stable): `bun add -d oxlint oxlint-tsgolint`; root `.oxlintrc.json` with plugins typescript/oxc/import/unicorn/vitest/react/react-hooks, categories correctness+suspicious=error, perf+pedantic=warn, `typescript/no-explicit-any: error`, `no-floating-promises`, `switch-exhaustiveness-check`, `import/no-cycle`; ignores dist/node_modules/examples/apps/e2e/test-results; script `"lint": "oxlint --type-aware"`. Type-aware needs built .d.ts for cross-package imports — build before lint. "AI slop" = third-party `dmmulroy/anti-slop` (16 custom rules, vendor-only): do NOT adopt wholesale — its `no-unknown-parameters`/`no-unknown-returns`/`no-runtime-typeof` conflict with the codec/validate trust-boundary style; optionally vendor the type-assertion rules only.
2. **Type-safety audit:** verified — packages/*/src already has zero real `any` (one comment-word hit); `unknown` ~42x, concentrated at trust boundaries (deliberate, keep). Lint locks this in; manual pass only over WS-1..3 diffs.
3. **Duplication check:** oxlint has no copy-paste detection; run `bunx jscpd packages/*/src` as an advisory scan; deduplicate real findings (known candidates: `isElement`/`parentOf` triplicated in occlusion.ts, registry.ts, resolver.ts — one shared internal module).
4. **Performance verification:** run packages/core/bench/hotpath.bench.ts before/after the fixes; confirm no regression from WS-1/WS-2 changes (dirty-flag path, resolver caching should improve, style memoization should improve); document numbers.
5. **Documentation quality:** review docs/ + README + JSDoc with the simple-english standard (short sentences, active voice, one-line JSDoc — no bloated blocks); fix drift introduced by WS-1..3; ensure public API is fully and accurately documented.

## Final advisor pass (no agent)
- Reconcile SPECIFICATION.md (§5 status replay, §9 pointerover, §13/§14.1 unchanged-identity now true) and README if touched.
- Cross-workstream review: independent verification agent over the combined diff, then typecheck + full test suite + bench sanity.
- Explicitly re-check public API surface for unintended changes (d.ts diff of all three packages).

## Deliberately not fixed
- D-5 code change (containing-block model): documented instead — spec-conformant, high effort, low payoff.
- C-9 beyond documentation: dirty-flag model (WS-1.1) removes the identity guard entirely, which subsumes it.

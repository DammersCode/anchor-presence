# Review Validation — verified findings + evidence

Validated 2026-09-01 by two independent validation agents (core: C-1..C-9 + R-6; dom/react: D-1..D-6, R-1/2/4/5/7) against code, spec, docs, and tests. All 123 unit tests pass; none contradict any finding. Empirical checks: scratchpad repro scripts (C-1, C-2, C-9), Chromium/Playwright check (D-4).

Status legend: confirmed | partial | false-positive | irrelevant. No finding was false-positive or irrelevant.

| ID | Status | Verdict (evidence) | Severity | Root-cause group |
|---|---|---|---|---|
| C-1 | confirmed | No publish path on setContext/setUser (client.ts:207-213); repro: 0 sends for 5 s, rides only on heartbeat. Fix needs a dirty flag — plain `schedulePublish()` is skipped by the identity guard (client.ts:155) | medium | A |
| C-2 | confirmed | Repro: send during "reconnecting" marks `lastSentCursor` (transport silently drops, promise rejection swallowed client.ts:141-143); reconnecting→connected → 0 republishes. Both doc transports drop silently | medium | A |
| C-3 | confirmed | No replay-on-subscribe in transport.ts:6-12, spec §5, or any of the three doc adapters; client starts "connecting" (client.ts:101). Already-connected transport ⇒ permanently mute client. Optional `getStatus()` is non-breaking | high | D |
| C-4 | confirmed | `pointer` validated inbound (validate.ts:139-147), never produced (client.ts:123-134; pointer.ts discards `event.pointerType`). Threading it through is additive | low | F |
| C-5 | confirmed | dispose (client.ts:238-251) sends no `cursor:null` and even clears a pending null publish (line 241). Spec §4.1 tolerates expiry, but best-effort `send(null)` is cheap, in-spec, non-breaking | medium | C |
| C-6 | confirmed | client.ts:181-189 unguarded; store fan-out sync (store.ts:90-93). Exposure: custom codecs + throwing subscribers abort transport dispatch loops | low | B |
| C-7 | confirmed | `staleTimeoutMs:0` → self-rearming `setTimeout(0)` chain (browser-clamped ~4 ms, still churn); `heartbeatMs<=0` floods. No option validation | low | F |
| C-8 | confirmed | Push after dispose is silently dropped (client.ts:234-236 vs 248 splice + idempotence guard 239); remount race leaks listeners | low | C |
| C-9 | partial | Mechanism true (identity guard skips mutated same-reference cursor), but "updates stop" overstated: heartbeat re-encodes the mutated object ⇒ degrades to ≤10 s cadence, doesn't stop | low | A |
| D-1 | confirmed | registerTeardown never unregisters (client.ts:234-236); binding.ts:110 + pointer.ts:95 append per instance; docs' own key-remount recipe (docs/react.md:340-346) leaks disposed closures. Retention only, no double-free | medium | C |
| D-2 | confirmed | scroll/transition events are composed:false, MO doesn't descend into shadow roots (scheduler.ts:231,240,243-248) while registry/pointer/occlusion/hit-test all support shadow DOM; spec §9 excludes only *closed* roots ⇒ genuine Invariant-7 gap for open-shadow anchors. ResizeObserver partially mitigates (sizes, not scroll/moves) | medium | E |
| D-3 | confirmed | `dirty` set (scheduler.ts:107-110) but getCachedRect ignores it (318-320); ≤1-frame stale rect for outbound u/v, contradicts pointer.ts:40-41 comment. Fallback measure path already exists | low | E |
| D-4 | confirmed (empirical) | Chromium: document-level `pointerenter` fires with target/composedPath[0] = `#document` (non-Element) → eventTargetElement bails; element enter events never reach document (non-bubbling). Dead registration; `pointerover` verified to deliver an Element target. Unit tests mask it via synthetic `bubbles:true` events (pointer.test.ts:29) | low | F |
| D-5 | partial | Factually true but code implements spec §10 verbatim — spec-model limitation, not an implementation bug; bites only with the docs-recommended clippedPointPolicy. Document the limitation; full containing-block model is significant work | low | F (docs) |
| D-6 | confirmed | getComputedStyle passthrough uncached (scheduler.ts:97-99, frameCache.ts:55); computeVisibleRect calls getStyle on *every* ancestor per presence (occlusion.ts:74-75, resolver.ts:85). N×depth style reads per pass; no forced reflows though | low | E |
| R-1 | confirmed | contextStore never seeded from `options.context` (contextStore.ts:15 vs client.ts:90); no `getContext()` on PresenceClient; direct `client.setContext()` bypasses mirror; docs/react.md:182 promises current value. Additive fix | medium | A/F (needs core `getContext()`) |
| R-2 | partial | Both exports real (protocol.ts:28 = 8 vs pointer.ts:7 = 4), but validate.ts:81 *truncates* keeping most-specific anchors ⇒ graceful degradation; harm is naming confusion only. Rename breaks dom importers → deprecated alias | low (downgraded from medium) | F |
| R-4 | confirmed | react re-exports zero foreign types used in its public signatures; softened by core/dom being regular deps. DX nicety, additive | low | F |
| R-5 | confirmed | docs/react.md:109 omits `pointVisible`; same doc uses it at :132 | low | F (docs) |
| R-6 | confirmed | binding.ts:103-109 / client.ts:247 clear listeners without final notify; uSES hooks render last snapshot/status forever if provider outlives client. Narrow but real | low | C |
| R-7 | confirmed | Fresh ResolvedCursor objects every resolveAll (resolver.ts:158,192-203) + unconditional notify (scheduler.ts:123) ⇒ CursorLayer re-renders every pass; **violates spec §14.1** ("an unchanged list keeps its identity"). Resolver-side instance caching fixes all useRemoteCursors* consumers | medium | E |

## New findings from validation (all confirmed by their discoverer)

| ID | Bereich | Problem | Severity | Group |
|---|---|---|---|---|
| M-C-1 | client.ts:153-158,163-164 | Failed publish (send → false) never re-arms the timer; heartbeat resends `lastSentCursor` (old state), so the newest position stalls until next pointer move/reconnect | low | A |
| M-C-2 | client.ts:123-134 | Limits enforced inbound only; oversized context/user (>8 KiB) or message (>32 KiB) is silently stripped/dropped by receivers with zero sender-side signal | low | F |
| M-C-3 | client.ts:112-121 | Status-listener fan-out unguarded AND runs before the reconnect-republish logic — one throwing listener kills the republish guarantee | low | B |
| M-D-1 | scheduler.ts:112-127,240 + cursor.tsx:103 | CursorLayer's own transform writes re-dirty the scheduler via its MutationObserver ⇒ the spec §13 interpolation-only reuse path effectively never engages while cursors render in the observed document | low-medium | E |
| M-D-2 | scheduler.ts:240 | `mutationObserver.observe(doc.body, …)` without null guard; pre-body init + first remote data throws through the unguarded transport callback | low | B |

## Root-cause groups
- **A — publish dirty-state model:** identity comparison (`latestCursor !== lastSentCursor`) is the sole dirty signal ⇒ C-1, C-2, C-9, M-C-1 (R-1 needs the same "context is readable state" shift)
- **B — unguarded synchronous fan-out:** C-6, M-C-3, M-D-2
- **C — dispose/teardown lifecycle:** D-1, C-5, C-8, R-6
- **D — transport status contract:** C-3
- **E — frame/render identity & cache discipline:** R-7, M-D-1, D-2, D-3, D-6
- **F — API surface, options, docs:** C-4, C-7, R-2, R-4, R-5, D-4, D-5, M-C-2

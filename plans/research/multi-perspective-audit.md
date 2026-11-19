# Multi-perspective audit and competitor research

Status: applied (steps 031-040 committed on `audit-improvements`; findings checked against the code at main 71ddb79) · 2026-09-29

## Fleet

Six read-only audit agents, one perspective each: performance, developer experience, UX, API design, customization, usability/accessibility. Three research agents: Liveblocks/PartyKit, Yjs/tldraw/Ably, npm alternatives and architecture alternatives. This file is the reviewable list: what we found, what we ship now, what stays backlog.

## Selection

Ship now (steps 031-041): the P0 hot-path performance findings, the dev-mode bug, the API unification (breaking), the z-index/modal fix, the a11y gaps (keyboard focus, touch clear), the presence-only mode, and the demo polish that makes all of it visible.

Deferred to backlog (last section): protocol-level features (remote click events, follow mode, off-viewport hints, locks) and doc-only gaps.

## Applied

| Step | Commit subject                                                                               |
| ---- | -------------------------------------------------------------------------------------------- |
| 031  | fix dev-mode detection in the browser and share it across packages                           |
| 032  | default autoConnect to true                                                                  |
| 033  | make the provider own client creation and drop usePresenceClient                             |
| 034  | count active remote cursors in the store                                                     |
| 035  | cache the anchor chain per target, clear touch cursors on pointer end, and add focus capture |
| 036  | hoist the resolver's per-frame containers and add allocation-free interpolator sampling      |
| 037  | raise the default cursor z-index and stop per-move render allocations                        |
| 038  | overlay the demo settings dialog and default the demo to spring motion                       |
| 039  | cover modal stacking, keyboard focus, and touch clear in e2e                                 |
| 040  | document the provider factory and the audit changes                                          |

## Findings by perspective

### Performance

P0 (hot path at cursor-move or frame rate):

- [035] Every `pointermove` (up to 1 kHz) walks the full ancestor chain with WeakMap/Map lookups, slices a new array, and allocates a `PointerInfo` literal, even when the pointer stays on the same element (pointer.ts:18-49, registry.ts:69-81). Fix: shared `PointerInfo` constants; cache the anchor chain per target element, invalidated by a registry generation counter.
- [036] While any remote cursor eases, `resolveAll` allocates ~1k small objects per frame: frame containers, a `RawResolution` per cursor, a visibility-policy input per cursor, a `sample()` result per cursor (resolver.ts:211-293, interpolate.ts:45-111). Fix: hoist the frame containers, scratch objects for geometry and policy input, optional `Interpolator.sampleInto`.
- [034] `hasActiveCursors` rebuilds the raw O(N) snapshot on every accepted inbound message (store.ts:179-185, binding.ts:152), and the rAF frame rebuilds it again. Fix: an `activeCursorCount` in `RemotePresenceStore`, read O(1). The resolver keeps receiving the raw snapshot because user visibility policies may read `sequence`.
  P1:

- [037] `window.matchMedia` runs during render of every moving cursor (cursor.tsx:145). Fix: one module-level `MediaQueryList` with a `change` listener.
- [037] `useRemoteUsers` allocates a `Map` plus one `RemoteUser` literal per client on every message, even cursor-only moves (use-remote-users.ts:33-51). Fix: persistent per-client map, list rebuilt only when membership or user fields change.

P1, deferred (real cost, not on the critical path):

- Live `getBoundingClientRect` at move rate while the frame cache is cold (pointer.ts:44). Only hits the outbound path while no remote cursor is active; a long-stale cache is not safe once the scheduler detaches, so the cost stays.
- `getComputedStyle` per clipping ancestor per re-measure frame during scroll storms (frame-cache.ts:35-39, occlusion.ts:59-81).
- `syncAnchors` re-diffs the anchor set and re-walks shadow roots on interpolation-only frames (signals.ts:151-163).

P2 (measured, low value at current scale): binary codec re-encodes the constant clientId/session per publish (binary-codec.ts:84-87); `closest()` per mutation record produced by our own cursor renders (signals.ts:40-44); fresh message object plus `JSON.stringify` per publish (publish-loop.ts:44-58).

Bench guard: none of the shipped steps move the gated baseline in `scripts/bench.ts` (inbound decode, `store.ingest`, `getSnapshot` identity). Verify outbound/frame improvements on the manual demo bench (`?page=bench`, `window.benchStats`).

### Developer experience

- P0 [031] `isDev()` is always true in the browser: four copies read `globalThis.process?.env` dynamically, which bundlers never rewrite, so dev warnings and the oversized-field `JSON.stringify` probe run in production builds (dev-warnings.ts:5-8, registry.ts:14-21, transport.ts:57-64, auto-register.ts:17-24). Fix: one `isDevMode()` in core that checks `import.meta.env?.DEV` then `NODE_ENV`, reused in dom.
- P0 [032] `autoConnect` defaults to `false`, so a client created without it never connects and stays silently inert. Fix: default `true`.
- P1 [040] Silent failure modes: oversized or invalid inbound messages drop without a trace (ingest.ts:12-19), and a WebSocket that cannot open warns nothing (transport.ts:161-168). Fix: dev-mode warnings, throttled.
- P1, deferred: no installable relay; the quick start still means running a hand-written server (DX-F3). `CursorLayer` generic inference needs validation before a fix (DX-F2).
- P2, deferred (docs): SSR page wording around `autoConnect` (DX-F6), no Next.js page (DX-F7), ESM-only note (DX-F8), test-injection types in the dom public exports (DX-F9), `bindingOptions` silently ignored after creation (DX-F10), no deprecation story (DX-F11).

### UX

- P0 [037] `DEFAULT_Z_INDEX = 50` (cursor.tsx:7) sits below typical modal z-indices, so cursors disappear behind modals. Fix: default `9999` plus an additive `zIndex` prop; the demo dialog stops using the top layer (step 038).
- P1 [038] The default linear ease (80 ms) visibly lags a cursor that retargets at 20 Hz. The demo defaults to its spring interpolator.
- P1 [deferred] No element affordance for "who is looking at this" (a ring on the anchor, UX-F5); duplicate user names are indistinguishable in the demo (UX-F4); the cursor label clips at the viewport edge and should flip (UX-F6).
- P2 [deferred]: static fake avatars (UX-F7), badge overlap (UX-F8), duplicate online counts (UX-F9), idle state in the user list (UX-F10), reduced-motion handling runs once per render (UX-F11), no remote click signal (UX-F12, same as Customization F1), no fallback hint when nothing resolves (UX-F13).
- Stale cursors: a disconnected client's cursor stays for `staleTimeoutMs` (70 s default) by design; the "stuck cursor" reports in the demo review need a repro before changing this (UX-F3).

### API design

- P0 [033] Four ways to create a client, with confusing names: `usePresenceClient` is the creator (module-level global `Map` registry), `usePresenceClient` is the getter, the provider `client` prop is a third way, and the demo uses a module singleton. Fix: the provider owns creation through a `factory` prop; the `client` prop stays as bring-your-own; `usePresenceClient` is removed (breaking).
- P0 [032] `autoConnect` default `false` to `true`.
- P1 [deferred] The remaining API P1 findings (F3-F8) were truncated in the review pass; revisit when the provider factory lands.

### Customization

- P0 [035] No presence-only mode (context/user without a local cursor). Fix: `localCursorCapture: false` on `DomBindingOptions` skips the pointer source.
- P0 [deferred] No remote click/press events: the wire carries pointer position only. A protocol-level `click` field plus `onRemoteClick` is the fix; large effort, next iteration.
- P1+ [deferred] The remaining customization P1 findings were truncated in the review pass.

### Usability / accessibility

- P0 [035] Keyboard-only users are invisible: no `focusin`/`focusout` handling. Fix: opt-in `captureFocus` on `DomBindingOptions`; the cursor publishes at the focused element's center and clears on blur.
- P0 [035] Touch cursors stick: nothing clears the local cursor after a touch ends (no `pointerup`/`pointercancel` handling). Fix: track active touch pointers, clear on the last release.
- P1 [037] No way to adjust cursor stacking without a global CSS override: covered by the `zIndex` prop.

## Competitor comparison

| Capability                                                                | Liveblocks        | PartyKit          | tldraw                      | Ably / Yjs              | npm alternatives                                                       | anchor-presence                                                            |
| ------------------------------------------------------------------------- | ----------------- | ----------------- | --------------------------- | ----------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Server-side / AI-agent presence with TTL (`identifyUser`)                 | yes               | managed rooms     | no                          | partial (Ably presence) | no                                                                     | no (backlog)                                                               |
| Managed edge WebSocket rooms + auto-reconnect socket                      | yes               | yes (PartySocket) | no                          | yes (Ably)              | no                                                                     | BYO relay; reconnect with jittered backoff built into the transport        |
| Shared-viewport cursor sync (Figma-style pixels)                          | yes               | yes               | yes                         | yes                     | yes (perfect-cursors ~119k dl/wk, quill-cursors ~49k, y-presence ~11k) | no, by design                                                              |
| Element-addressed resolution across divergent layouts and viewport sizes  | no                | no                | no (document coordinates)   | no                      | no                                                                     | yes: anchor tier, then viewport tier, with a user visibility policy        |
| Occlusion / "out of view" state for a cursor point                        | no                | no                | partial (off-viewport hint) | no                      | no                                                                     | yes (`pointVisible`, clip-ancestor walk)                                   |
| Off-viewport hint arrow                                                   | no                | no                | yes                         | no                      | no                                                                     | no (backlog)                                                               |
| Follow mode                                                               | no                | no                | yes                         | no                      | no                                                                     | no (backlog)                                                               |
| Cursor chat bubbles                                                       | no                | no                | yes                         | no                      | no                                                                     | no                                                                         |
| Component locks                                                           | no                | no                | no                          | yes (Ably)              | no                                                                     | no (backlog)                                                               |
| Recently-offline avatars / retention window                               | no                | no                | no                          | yes (2 min retention)   | no                                                                     | configurable `staleTimeoutMs` / `idleAfterMs`, no "recently offline" state |
| Semantic coarse location ("in the header area")                           | no                | no                | no                          | yes (Ably)              | no                                                                     | equivalent via free-form `context`                                         |
| Avatar stack component                                                    | yes (AvatarStack) | no                | partial                     | no                      | no                                                                     | `useRemoteUsers` + app-side UI (partial)                                   |
| Delta encoding, sequence-based store, adaptive publish rate, binary codec | managed           | managed           | own engine                  | Ably only               | no                                                                     | yes                                                                        |
| SSR / StrictMode-safe React adapter, zero runtime dependencies            | no (their editor) | no                | no                          | varies                  | varies                                                                 | yes                                                                        |
| Framework-agnostic core with per-framework adapters                       | no                | no                | no                          | partial                 | no                                                                     | yes                                                                        |

## Alternative architectures

- Shared viewport/document coordinates (Figma, tldraw, quill-cursors, y-presence): simplest, but the sender's pixels only make sense when every receiver renders the same layout at the same size. Responsive layouts, different browser sizes, and reflow break it. Layout divergence is exactly the problem element addressing solves.
- The remaining alternative architectures from the research pass (managed-room services, CRDT awareness maps) are transport or state-layer choices, not position-resolution choices; they compose with this library as a transport.

## What anchor-presence does better

- Cursors stay anchored to the element they point at when layouts differ between peers; no shared-coordinate assumption.
- Tiered fallback (anchor, then sender viewport) with a user-pluggable visibility policy, so "what to show when nothing resolves" is a policy, not a hardcode.
- Occlusion detection: the library knows when a resolved point sits in a clipped or hidden region.
- Bandwidth discipline: delta fields, sequence de-duplication, adaptive publish rate, binary codec, capped store.
- The transport ships reconnect with exponential backoff and full jitter; the relay itself stays a ~50-line commodity (examples for Bun, Node `ws`, Hono, Elysia, Socket.IO, SignalR).
- Small surface: three packages, no runtime dependencies, core is DOM-free.

## Deferred backlog (next-iteration candidates, by value)

1. Remote click/press events: wire `click` field + `onRemoteClick`/`onCursorEvent` hooks (protocol v2).
2. Off-viewport hint arrow (tldraw-style) using the existing tier/fallback data.
3. "Who is looking" ring on the anchored element (UX-F5).
4. Follow mode: pin the local view to a peer (needs a view-state channel; reuse `context`).
5. Cursor label flip + ellipsis at viewport edges (UX-F6).
6. `CursorLayer` type inference from the provider context (DX-F2; validate the TS2571 repro first).
7. Installable relay / zero-backend quick start (DX-F3).
8. Docs: Next.js page, ESM-only note, SSR/autoConnect wording, deprecation policy, "recently offline" state (Ably-style).

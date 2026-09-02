# Performance

The geometry scheduler is the one place Anchor Presence touches layout. This page explains its model, its invalidation signals, its idle behavior, its performance budgets, and guidance for keeping it fast.

## Geometry scheduler model

One shared scheduler runs per client. There are no per-cursor measurement loops.

The scheduler exposes one method: `invalidate(reason?: string)`. Any signal calls it. The scheduler coalesces every call inside a frame into one `requestAnimationFrame` pass with three phases:

```text
READ PHASE     measure every active anchor once (getBoundingClientRect), plus viewport size
COMPUTE PHASE  resolve every remote cursor from the cached rects
NOTIFY PHASE   publish one immutable snapshot to subscribers
```

Active anchors are the union of anchor IDs referenced by current remote cursors: the first resolvable anchor per cursor, probed in fallback-chain order. Each element is measured at most once per frame. All reads happen before any consumer code runs, so one pass causes at most one forced reflow.

## Invalidation signals

The scheduler listens for these signals while at least one remote cursor is active:

- `resize` on `window`
- `scroll` on `window` and on scrollable ancestors, through one capture-phase document scroll listener
- `ResizeObserver` on each active anchor element and on `document.documentElement`
- one `MutationObserver` on `document.body` (`childList`, `attributes`, `subtree`), for moves with no dedicated signal: sibling insertion or removal, instant class toggles, transform changes
- a capture-phase scroll listener and a `MutationObserver` on each open shadow root that holds an active anchor, because document-level scroll and mutation signals stop at shadow boundaries
- anchor register or unregister
- new remote presence data
- CSS transition and animation start and end events
- the public `invalidate()` call, for application-triggered layout changes

`ResizeObserver` alone cannot detect an element that moves without resizing. The combination of scroll, resize, mutation, and transition signals is what makes Invariant 7 hold: a local layout change repositions a stationary remote cursor without a new network packet.

### When to call invalidate() yourself

Call the binding's `invalidate()` after a programmatic layout change the built-in signals cannot see, for example:

- an instant CSS Custom Highlight or canvas-driven layout shift
- a layout change inside a browsing context the `MutationObserver` does not cover
- any case where you already know geometry changed and want the next frame to reflect it immediately, instead of waiting for a signal

```ts
const binding = createDomBinding(client);
// after a programmatic layout change
binding.invalidate("manual-layout-shift");
```

Most application code never needs to call this. The built-in signals cover ordinary DOM mutation, resize, scroll, and animation.

## Idle behavior

With no active remote cursors, no `requestAnimationFrame` loop runs, and every scheduler signal disconnects: transition listeners, mutation observers (including shadow-root observers), scroll and resize listeners, and every `ResizeObserver`. The scheduler is event-driven, not polling. It reattaches automatically when a remote cursor becomes active again.

## Budgets

- One `requestAnimationFrame` pass per frame maximum. Zero passes while idle.
- Each active anchor is measured at most once per frame.
- 100 cursors over 20 distinct anchors: one snapshot object per frame, under 2 ms scripting per pass on a mid-range laptop. This is a benchmark target, not a gated test.
- Publishing rate defaults to 20 Hz (`publishIntervalMs: 50`), and is configurable per client.
- Outbound `context` and `user` fields are delta-encoded: a changed field is sent once, full reconnect/heartbeat publishes include the current values, and later cursor messages omit unchanged fields.
- The optional `adaptivePublish` client option slows the publish rate when a transport reports a growing send buffer.
- Benchmark scenarios live in the demo app: 1, 10, 50, and 100 cursors, crossed with 10, 100, and 1000 anchors; a resize storm; and nested scroll.

## Measured reference

Dev-machine reference from 2026-09-02:

- Browser scheduler pass (Chromium, demo bench page, 240-sample rolling window): 100 anchors × 50 cursors ≈1.1 ms mean, ≈2.0 ms p95
- Core inbound path (Node/vitest hot-path bench, decode → validate → ingest): ≈490k messages/s

## Scaling limits

The default relay forwards every message to every other socket in a room, so relay traffic grows with `senders × receivers`. The library reduces per-message cost (delta `context`/`user`, one validation pass, optional adaptive publish rate), but it does not change the room-broadcast fan-out. For large rooms, move receivers into smaller rooms, add relay-side rate limits and message caps, or introduce a server-side aggregator.

The reference relay in `apps/server/index.ts` is intentionally minimal. Production relay hardening (authentication, per-socket limits, ping, logging discipline, horizontal scale) is a server concern, not a library transport concern. See `docs/transports.md` for the boundary.

## Guidance

**Register stable anchors.** Map an anchor ID to one long-lived semantic location: a button, a row template, a section. Do not generate a new anchor ID per render for the same logical element; each new ID is a fresh registry entry and forces re-registration.

**Avoid registering thousands of ephemeral anchors.** A very long, fully-rendered list that registers one anchor per row scales the registry and the `MutationObserver` surface with row count. Prefer registering anchors on visible or windowed rows only, and fall back to a coarser anchor (the list container) for off-screen rows.

**Call `invalidate()` after programmatic layout changes** the built-in signals cannot see. See "When to call invalidate() yourself" above. Do not call `invalidate()` on every render; the scheduler already coalesces signal-driven invalidation into one pass per frame, and an unnecessary call only adds a dirty flag, not a full reflow, so it is cheap but still unneeded in most cases.

# Anchor Presence — Technical Specification

Version: 1.5

## 1. Purpose

Anchor Presence is a live cursor system for DOM applications. It does not use a canvas. It shows remote user cursors at the correct semantic position, even when the two clients have different layouts.

The central invariant:

> A remote cursor represents a semantic DOM location, not an absolute screen coordinate.

A sender transmits a semantic anchor ID, a normalized position inside that anchor, fallback anchors, a fallback viewport position, and optional UI context. The receiver resolves this data against its own current DOM layout. The receiver layout is authoritative.

## 2. Invariants

1. Absolute sender screen coordinates are never the primary cross-client positioning representation.
2. Receiver layout is authoritative.
3. Semantic anchors survive responsive layout changes.
4. Missing exact anchors degrade predictably: exact anchor → nearest registered parent → larger region → viewport fallback → visibility policy.
5. Framework adapters do not own core presence state.
6. Transport implementation is independent from cursor logic. Core imports no transport library.
7. A local layout change repositions a stationary remote cursor without a new network packet.
8. Network messages cannot execute arbitrary DOM selectors. Anchor IDs resolve only against the registered anchor map.
9. Rendering is consumer-controlled. No cursor component is required. `@anchor-presence/react` provides optional, configurable cursor components.
10. Future framework adapters (Svelte, Vue, Solid) require no architectural rewrite.

## 3. Package Architecture

```text
packages/
  core/     @anchor-presence/core
  dom/      @anchor-presence/dom
  react/    @anchor-presence/react
apps/
  demo/     React admin dashboard (Vite, Tailwind, shadcn-style UI)
  server/   Bun WebSocket relay for the demo
```

Dependency direction: `react → dom → core`. Core has zero dependencies and zero DOM globals. Dom depends only on core. React is an adapter only.

### 3.1 core

Responsibilities: protocol types, message validation, sequencing, presence store, stale-presence expiry, transport interface, codec interface, context-policy interface, interpolation interface, client orchestration.

Core must not import: DOM types at runtime, React, any transport library, any codec library. Core runs in Node, Bun, workers, and browsers.

### 3.2 dom

Responsibilities: anchor registry, pointer capture, pointer target resolution, normalized coordinate math, viewport fallback, geometry scheduler, remote anchor resolution, visibility policies.

### 3.3 react

Responsibilities: provider component, hooks, SSR safety. React subscribes to core/dom stores with `useSyncExternalStore`. React holds no engine state. Anchors are declared in the DOM through the binding's anchor attribute; React has no anchor registration hook.

## 4. Protocol

### 4.1 Wire types

```ts
type AnchorPoint = {
  id: string;      // registered semantic anchor ID
  u: number;       // 0..1 across the anchor, clamped by receiver
  v: number;       // 0..1 down the anchor, clamped by receiver
};

type CursorPosition = {
  anchors: AnchorPoint[];          // ordered, most specific first
  viewport?: { u: number; v: number };  // normalized viewport fallback
};

type CursorPresence<TContext = unknown, TUser = unknown> = {
  version: 1;
  clientId: string;                // identifies a client INSTANCE (tab/connection), not a user
  session: string;                 // random per client instance, generated at client creation
  sequence: number;                // monotonic per (clientId, session)
  cursor: CursorPosition | null;   // null = pointer left / hidden
  context?: TContext | null;       // opaque to core; `null` = cleared, missing = unchanged
  user?: TUser | null;             // opaque to core; `null` = cleared, missing = unchanged
  pointer?: { type?: "mouse" | "pen" | "touch" };
};
```

Leave messages use `cursor: null`. A separate `{ version: 1, clientId, sequence, type: "leave" }` message is not required; `cursor: null` plus expiry covers departure.

`context` and `user` are delta-encoded on the wire. A missing field means "unchanged since the previous same-session message"; an explicit `null` clears the field. Full publishes (reconnect and heartbeat) include the current values, including `null` for empty fields, so a missed clear is repaired on the next full publish. The receiver normalizes a cleared field to `undefined` in its snapshot. All senders and receivers in a room must understand this encoding; a receiver that does not merge missing fields can lose `context`/`user` values.

### 4.2 Validation limits

All inbound data is untrusted. The decoder output passes through `validatePresence()` before it reaches the store. Limits (constants in core, overridable by config):

| Field | Rule |
|---|---|
| version | must equal 1, else drop |
| clientId | string, 1–128 chars, else drop |
| session | string, 1–64 chars, else drop |
| sequence | finite integer ≥ 0, else drop |
| anchors | array, max 8 entries, else truncate to 8 |
| anchor id | string, 1–256 chars, else drop that entry |
| u, v | finite number, clamp to [0, 1] |
| viewport u, v | finite number, clamp to [0, 1] |
| context | max 8 KiB when JSON-encoded, else drop the field |
| user | max 8 KiB when JSON-encoded, else drop the field |
| whole message | max 32 KiB encoded, else drop |

Anchor IDs are opaque map keys. They are never used as CSS selectors, query strings, or code.

The store caps remote clients at `maxRemoteClients` (default 64, configurable). A message from a new `clientId` beyond the cap is dropped. This bounds all allocation driven by network data (store entries, resolved cursors, observed anchors). Expiry and disconnects free slots.

`user` and `context` values are untrusted. Consumers must render them as text (text nodes / framework text interpolation), never as HTML. The demo renderer follows this rule.

### 4.3 Sequencing

Each client keeps one local counter. Every outbound message increments it. The receiver stores `(session, lastSequence)` per remote `clientId`. Ordering rules:

1. If the inbound `session` differs from the stored session for that `clientId`, accept the message and reset `lastSequence`. A restart or reconnect gets a new random session, so restarts recover on the first message.
2. If the session matches and `sequence <= lastSequence`, drop the message.
3. Otherwise accept and store the new sequence. For an accepted same-session message, missing `context`/`user` fields inherit the stored values; explicit `null` clears them. A session change starts with no inherited fields.

Wall clocks are not used for ordering. Two live tabs that share a `clientId` have different sessions; rule 1 makes them last-write-wins instead of dropping each other. Note: a shared `clientId` is misuse — it causes visible cursor flapping between the two tabs, not an error.

### 4.4 Presence expiry

The store records `lastSeenAt` (local receive time) per remote client. A sweep removes clients not seen for `staleTimeoutMs` (default 70 000 ms). Sender emits a heartbeat (repeat of last state) every `heartbeatMs` (default 10 000 ms) while connected. The stale default sits above 60 s because browsers clamp hidden-tab timers to one minute; a backgrounded sender therefore stays present instead of flickering out. `cursor: null` hides the cursor immediately. A duplicate `clientId` replaces the previous entry (last write wins, per sequencing rule 1).

## 5. Transport Abstraction

```ts
type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface LiveCursorTransport {
  connect?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
  send(data: Uint8Array): Promise<void> | void;
  subscribe(listener: (data: Uint8Array) => void): () => void;
  subscribeStatus?(listener: (status: ConnectionStatus) => void): () => void;
  getStatus?(): ConnectionStatus;
  bufferedBytes?(): number;
}
```

Core never imports a transport implementation. `@anchor-presence/dom` ships `createWebSocketTransport` for the repository relay; it is a convenience transport, not a core dependency. `send` failures are swallowed after a status check; presence is lossy by design. When a transport omits `subscribeStatus`, the client reports a constant `"connected"`. The status union is fixed for protocol v1; consumers can switch exhaustively.

A transport that implements `subscribeStatus` SHOULD replay its current status to every new subscriber. `getStatus` is optional; when present, the client reads it once at creation for its initial status. Without either signal, the client assumes `"connecting"` until the first status callback — an already-connected transport that never replays would leave the client mute. The client sends only while the status is `"connected"`; `"connecting"`, `"reconnecting"`, and `"disconnected"` block sends. `bufferedBytes` is optional and is used only by the opt-in `adaptivePublish` client option.

## 6. Codec Abstraction

```ts
interface CursorCodec {
  encode(message: CursorPresence): Uint8Array;
  decode(data: Uint8Array): unknown;   // validated afterwards by core
}
```

Core ships `jsonCodec` (TextEncoder/TextDecoder + JSON) and `binaryCodec` (compact fixed binary layout with JSON payloads for `context` and `user`). The decoder returns `unknown`; `validatePresence()` produces a typed message or `null`. Malformed input never throws past the decode boundary. All clients in a room must use the same codec.

## 7. Client Orchestration (core)

`createPresenceClient(options)` wires the parts:

```text
pointer samples (from dom)         inbound bytes (from transport)
        ↓                                   ↓
  latest-state slot                    codec.decode
        ↓                                   ↓
  rate-limited publisher              validatePresence
        ↓                                   ↓
  codec.encode → transport.send      remote presence store → subscribers
```

Options: `transport`, `codec` (default json), `clientId` (default: random UUID via injected `idFactory`), `publishIntervalMs` (default 50), `staleTimeoutMs`, `heartbeatMs`, `maxRemoteClients`, `user`, `context` setter, `adaptivePublish`. The client generates its `session` value at creation from the same `idFactory`. `clientId` identifies a client instance; applications attach user identity via the `user` field, not the `clientId`. The client clamps `publishIntervalMs` and `heartbeatMs` to at least 1 ms and `staleTimeoutMs` to at least 1000 ms. Outside production (`NODE_ENV !== "production"`), the client warns on `console` when the outbound `context` or `user` exceeds `maxFieldBytes` or the encoded message exceeds `maxMessageBytes`; the check runs when `context`/`user` changes, not per message.

`updateLocalCursor(cursor, pointer?)` records the latest local cursor; the optional second argument (`{ type?: "mouse" | "pen" | "touch" }`) is kept until replaced and sent as the `pointer` wire field. `getContext()` and `getUser()` return the current outbound values; `setContext()` and `setUser()` replace them and trigger a publish, as does every transition into `"connected"` (so a reconnect republishes the latest state without waiting for a pointer move). A failed send re-arms the publish timer.

The client ignores inbound messages whose `clientId` equals its own, so broadcast relays that loop messages back are safe. The stale sweep runs on a client-owned timer at `staleTimeoutMs / 2`.

`client.dispose()` is part of the public API. It sends a best-effort `cursor: null` leave message while the status allows it, stops timers, unsubscribes from the transport, and (via the dom layer) removes document listeners, observers, and any pending animation frame. Status listeners receive a final `"disconnected"` before they are cleared. Every layer's setup function returns or registers its teardown with the client. `registerTeardown(fn)` returns an unregister function; called on an already-disposed client, it runs `fn` immediately and returns a no-op.

The publisher keeps only the latest local state. It sends at most one message per interval. It never queues stale positions. Timers are injected (`setTimeout`/`clearTimeout`-shaped scheduler interface) so tests run without real time.

`adaptivePublish` is optional and active only when the transport implements `bufferedBytes()`. It steps the publish interval to a slower interval when the reported buffer reaches `highWatermarkBytes` (default 64 KiB) and returns to the normal interval at `lowWatermarkBytes` (default half of the high watermark). Defaults: `slowPublishIntervalMs = max(publishIntervalMs * 4, 100)`. Heartbeats keep their own schedule.

The remote store exposes `getSnapshot()` and `subscribe(listener)`. Snapshots are immutable objects, so `useSyncExternalStore` works without tearing.

## 8. Anchor Registry and Auto-Registration (dom)

`createDomBinding` owns an internal `AnchorRegistry` and always watches the DOM for anchor elements.

```ts
interface AnchorRegistry {
  register(id: string, element: Element): () => void;
  get(id: string): Element | null;
  has(id: string): boolean;
  ancestors(element: Element): { id: string; element: Element }[]; // innermost first
}
```

The registry is an internal implementation detail. It is not part of the public `DomBinding` surface.

Public binding configuration:

```ts
type DomBindingOptions = {
  anchorAttribute?: string; // default "data-anchor"
  maxAnchors?: number;      // default 4, clamped to 1..8
  resolution?: ResolutionOptions;
  environment?: EnvironmentOptions;
};
```

Auto-registration rules:

- The binding scans `environment.root` (default `document`) at creation.
- It observes `childList`, `subtree`, and attribute changes for `anchorAttribute`.
- An element is registered when its configured attribute has a non-empty value after trimming.
- The attribute value is the anchor ID.
- Attribute changes re-register the element under the new ID.
- Attribute removal or element removal unregisters the element.
- Empty or whitespace-only values are ignored and warn once in development.
- No generated IDs are created.

Registry rules:

- `register` returns an unregister function. Unregister removes the entry only if it still points at the same element.
- Duplicate registration of one ID with a different element: the new element wins, and one `console.warn` fires per anchor ID per binding in development builds. This makes remount-before-unmount (React strict mode, virtualized lists) deterministic.
- A stale entry (element no longer connected) reads as absent: `get` returns `null` when `element.isConnected` is false.
- Lookup is `Map<string, Element>` plus a reverse `WeakMap<Element, string>` for ancestor walks. The reverse map can hold a stale entry after a new-element-wins replacement, so `ancestors()` cross-checks the forward map (`map.get(id) === element`) before it reports an entry.

## 9. Pointer Capture and Target Resolution (dom)

On `pointermove` (and `pointerdown`, `pointerover`):

1. Read the event target. Inside shadow roots, use `event.composedPath()[0]` when available.
2. Walk up through ancestors (crossing shadow boundaries via `host`) and collect registered anchors, innermost first.
3. Build the fallback chain: up to `maxAnchors` (default 4, clamped to 1 through 8) anchors, most specific first.
4. For each anchor, compute `u = (clientX - rect.left) / rect.width`, same for `v`. Zero-size rects are skipped.
5. Compute viewport fallback: `u = clientX / innerWidth`, `v = clientY / innerHeight`.
6. Hand the sample to the core client, together with the pointer type (`event.pointerType`, when it is `mouse`, `pen`, or `touch`). The client keeps the latest pointer type and sends it as the wire `pointer` field.

The capture uses `pointerover`, not `pointerenter`: enter events do not bubble, so a document listener never receives one with an Element target.

The dom layer uses an internal default of `4` sent anchors. `DomBindingOptions.maxAnchors` clamps consumer values to `1` through `8`. Core's `DEFAULT_MAX_ANCHORS` (8, the inbound validation cap from section 4.2) remains the protocol limit.

On `pointerleave` of the document and on `blur` of the window: publish `cursor: null`.

Rect reads for the outbound path reuse the geometry cache (section 11) when the frame already measured that element.

Documented unsupported cases: closed shadow roots without registered hosts, iframes of any origin (pointer and viewport coordinates are per browsing context; an iframe needs its own client instance), pointer positions inside `<canvas>` content (the canvas element itself can be an anchor; its inner drawing cannot).

## 10. Remote Anchor Resolution (dom)

For each remote presence with a non-null cursor:

1. Walk the anchor chain in order. Take the first ID with a connected, measurable element.
2. Measure via the geometry cache: `rect = getBoundingClientRect()`.
3. `x = rect.left + rect.width * u`, `y = rect.top + rect.height * v`. Viewport coordinates; consumers position with `position: fixed`.
4. If no anchor resolves and `viewport` exists: `x = viewport.u * innerWidth`, `y = viewport.v * innerHeight`, resolution tier = `"viewport"`.
5. If nothing resolves: `visible: false`.

An element is measurable when it is connected and its rect has width > 0 and height > 0. `display: none` and unmounted anchors therefore fall through to the next anchor. Offscreen and clipped elements still resolve.

For an anchor tier, the resolver calculates `pointVisible`. It intersects the anchor rect with the padding box of each clipping ancestor. A clipping ancestor has `overflow`, `overflow-x`, or `overflow-y` other than `visible`. `pointVisible` is false when the resolved point is outside that visible rect. The default policy still shows this cursor. Applications can hide it with a policy.

Set `hitTest: true` on the DOM binding to refine anchor visibility with `document.elementFromPoint()`. The resolver runs this check only for points inside the viewport. It detects z-order occlusion, such as a dialog overlay. This option adds one hit test for each resolved cursor per frame.

`pointVisible` is true for the viewport tier. It is false for the hidden tier.

Resolved output per cursor:

```ts
type ResolvedCursor<TContext, TUser> = {
  clientId: string;
  x: number;               // receiver viewport px
  y: number;
  visible: boolean;
  pointVisible: boolean;
  anchorId: string | null; // which anchor won, null = viewport tier
  tier: "anchor" | "viewport" | "hidden";
  context?: TContext;
  user?: TUser;
};
```

### 10.1 Visibility policy

```ts
type VisibilityPolicy<TContext> = (input: {
  presence: CursorPresence<TContext>;
  resolution: { tier: "anchor" | "viewport" | "hidden"; anchorId: string | null; pointVisible: boolean };
}) => "show" | "hide";
```

Default policy: show on `anchor` and `viewport` tiers, hide on `hidden`. Applications override it to implement context rules (section 12).

## 11. Geometry Scheduler (dom)

One shared scheduler per client. No per-cursor measurement loops.

API: `invalidate(reason?: string)`. Any signal calls it; the scheduler coalesces calls into one `requestAnimationFrame` pass:

```text
READ PHASE    measure every active anchor once and derive its client rect, plus viewport size
COMPUTE PHASE resolve every remote cursor from the cached rects
NOTIFY PHASE  publish one immutable snapshot to subscribers
```

Active anchors include the first resolvable anchor for each remote cursor. They also include its clipping ancestors. Each element is measured at most once per frame. The scheduler derives its client rect from that cached bounding rect. Reads are batched before any consumer code runs, so the pass causes at most one forced reflow.

Invalidation signals:

- `window` `resize` → invalidate
- `scroll` on `window` and on scrollable ancestors: one capture-phase document scroll listener (`{ capture: true, passive: true }`) → invalidate
- `ResizeObserver` on each active anchor element and on `document.documentElement` → invalidate
- one `MutationObserver` on `document.body` (`childList`, `attributes`, `subtree`), or on `document.documentElement` when `body` does not exist yet → invalidate. This catches signal-less moves: sibling insertion or removal, instant class toggles, transform changes. The callback only sets a dirty flag, so DOM churn costs one coalesced rAF pass per frame.
- open shadow roots of active anchors: document-level scroll and mutation signals stop at shadow boundaries, so the scheduler attaches a capture-phase scroll listener and a `MutationObserver` (same options) to each shadow root in an active anchor's chain → invalidate. Roots are re-collected as the active anchor set changes.
- anchor register/unregister → invalidate
- new remote presence data → invalidate
- CSS transition and animation tracking (below)
- public `invalidate()` for application-triggered layout changes

ResizeObserver alone is insufficient: an element can move without resizing. Scroll, resize, mutation, and transition signals together uphold Invariant 7.

Transition tracking: document-level capture listeners for `transitionrun`, `transitionend`, `transitioncancel`, `animationstart`, `animationend`, `animationcancel`. Each start event opens a tracked entry keyed by target and name, and starts continuous rAF invalidation. An entry closes on its end or cancel event, or on a safety timeout of computed `duration + delay + 500 ms`, capped at 10 s. An animation with `animation-iteration-count: infinite` gets one short window (500 ms) instead of a tracked entry, so spinners cannot pin the rAF loop. When the last entry closes and every interpolator is settled, the rAF loop stops.

Idle behavior: with no active remote cursors, no rAF loop runs and every scheduler signal disconnects (transition listeners, MutationObservers, shadow-root observers, scroll and resize listeners, ResizeObservers). The scheduler is event-driven, not polling.

## 12. UI Context

`context` is opaque to core. The application sets it (`client.setContext({ route, dialog, ... })`) and it rides on every presence message. On the receiver, context reaches the visibility policy and the resolved cursor output. Core never interprets context fields.

Example policies the docs must show: hide the cursor when the sender is in a dialog the receiver has not opened; fall back to the dialog trigger anchor; show a passive presence indicator instead. The library never changes receiver UI state (no forced routes, dialogs, or sidebars).

Anchor fallback usually covers context mismatch geometrically: if `settings.dialog.invite` is absent, the chain falls to `settings` or viewport. Context policies exist for the semantic cases where geometric fallback is misleading.

## 13. Interpolation

Interpolation runs after resolution, on receiver-local x/y:

```ts
interface Interpolator {
  target(x: number, y: number, timestampMs: number): void;
  shift(dx: number, dy: number): void;  // move current AND target by a delta, no easing
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
}
type InterpolatorFactory = () => Interpolator;
```

Ships: `noneInterpolator` and `linearInterpolator` (fixed-duration ease toward target, default 80 ms), both exported from core and passed as `resolution.interpolatorFactory`. Spring/spline are future factories behind the same interface. While any interpolator is unsettled, the scheduler runs a rAF loop; when all are settled, it stops. Interpolation frames reuse cached bounding and client rects from the last read phase. A re-measure happens only when an invalidation arrived. Raw sender coordinates are never interpolated.

When a resolved position changes because of a local-only invalidation (scroll, resize, mutation) with no new network data for that cursor, the scheduler calls `shift(dx, dy)` with the position delta. Current and target move together, so an in-flight ease continues instead of truncating, and the cursor tracks its anchor rigidly during local scrolling.

Interpolation is applied in the dom layer's resolved snapshot, so all adapters get smoothed values for free; `resolution.interpolatorFactory: noneInterpolator` gives raw resolved values.

The resolver keeps one interpolator instance per remote `clientId` and prunes it when that client leaves. It also keeps output identity: a resolved cursor whose fields did not change keeps its object across passes, and a pass in which no cursor changed returns the previous array. Consumers can compare snapshots and cursors by reference.

## 14. React Adapter

```tsx
<LiveCursorProvider client={client}>...</LiveCursorProvider>
```

Hooks:

| Hook | Returns |
|---|---|
| `usePresenceClient({ factory, key? })` | a stable `PresenceClient` per `key`, or `null` before the mount effect runs (page-lifetime registry) |
| `useRemoteUsers()` | one entry per remote client: `clientId`, `user`, and `session` |
| `useRemoteCursors()` | `ResolvedCursor[]` snapshot (useSyncExternalStore) |
| `useRemoteCursorsSelector(select, isEqual?)` | a value derived from the snapshot, recomputed per frame |
| `useCursorPresence()` | raw remote `CursorPresence[]` |
| `useCursorStatus()` | `ConnectionStatus` |
| `useCursorClient()` | the client instance |
| `useCursorContext()` | `[context, setContext]` |

Anchors are declared in the DOM with the binding's anchor attribute. Cursor movement updates flow only to components using `useRemoteCursors`; the provider never rerenders the app tree per cursor frame.

`useRemoteCursorsSelector` narrows that flow further. It applies `select` to each snapshot and rerenders the component only when `isEqual` reports the selected value changed. `isEqual` defaults to `Object.is`. When the value is equal, the hook returns the previous reference, so a derived array or set keeps its identity. The server snapshot is `select([])`, computed once. The caller must keep `select` and `isEqual` stable across renders, for example with `useCallback` or a module-level function.

SSR: the client is created by the consumer in browser-only code, or the provider accepts `client: null` during SSR; every hook has a server snapshot (`[]`, `"disconnected"`). No module-level DOM access in any package.

### 14.1 Optional cursor components

`@anchor-presence/react` exports `CursorLayer` and `DefaultCursor`. Both are optional. A consumer can render remote cursors with `useRemoteCursors` directly instead, per Invariant 9.

`CursorLayer` calls `useRemoteCursorsSelector` once, with a selector that keeps the visible, unfiltered cursors. The resolver already keeps unchanged cursors' identity (section 13), and the selection compares element by element, so a list whose visible cursors did not change keeps its identity. For each selected cursor, `CursorLayer` renders one package-owned root `div`. The root style sets `position: fixed`, `left: 0`, `top: 0`, `pointerEvents: "none"`, and a `transform` from the resolved coordinates. The root carries `aria-hidden="true"` and four stable data attributes: `data-anchor-presence-cursor`, `data-anchor-presence-client-id`, `data-anchor-presence-tier`, and `data-anchor-presence-anchor` (empty string when `anchorId` is `null`).

```ts
type CursorLayerProps<TContext = unknown, TUser = unknown> = {
  getLabel?: (cursor: ResolvedCursor<TContext, TUser>) => ReactNode;
  getColor?: (cursor: ResolvedCursor<TContext, TUser>) => string;
  filterCursor?: (cursor: ResolvedCursor<TContext, TUser>) => boolean;
  getCursorProps?: (
    cursor: ResolvedCursor<TContext, TUser>,
  ) => Omit<ComponentPropsWithoutRef<"div">, "children">;
  renderCursor?: (props: CursorRenderProps<TContext, TUser>) => ReactNode;
};
```

`getCursorProps` can add classes, styles, and HTML attributes to the root. The package always applies its geometry values (`position`, `left`, `top`, `transform`, `pointerEvents`) after the consumer style, so a consumer style can never replace them. A consumer style can replace non-geometry values, such as `zIndex` (package default `50`). Package identity and accessibility attributes take the same precedence over consumer attributes.

If `renderCursor` is absent, the root renders `DefaultCursor`. If `renderCursor` is present, its return value replaces only the root's contents; the root itself stays package-owned. `CursorLayer` never reads fields from `cursor.user`. It does not catch errors from a consumer callback; those errors reach the nearest React error boundary.

`DefaultCursor` has no Tailwind dependency and no external stylesheet. It renders a small neutral SVG pointer, `20px` by default, in `#6b7280`, with no label when `label` is `null` or `undefined`. Three CSS custom properties override its visual: `--anchor-presence-cursor-color`, `--anchor-presence-cursor-size`, `--anchor-presence-cursor-label-color`. An explicit CSS variable takes precedence over the `color` prop.

Visual configuration lives on `CursorLayer` props only. `LiveCursorProvider` never gains rendering configuration.

## 15. Demo

- `apps/server`: Bun WebSocket relay. Broadcasts size- and rate-bounded binary messages to the other sockets in the same room, enforces a per-room socket cap, and performs no message inspection.
- `apps/demo`: Vite + React + Tailwind + shadcn-style admin dashboard (sidebar, topbar, stat cards, data table, settings dialog). Dozens of registered anchors (`nav.dashboard`, `stats.revenue`, `orders.row:17.actions`, ...). A collapsible sidebar and responsive grid demonstrate cross-layout correctness: open two windows at different sizes and sidebar states. Cursor renderer is demo code (colored SVG cursor + name label) built on the package `CursorLayer`, proving Invariant 9.

## 16. Performance Budgets

- One rAF pass per frame maximum; zero rAF while idle.
- Each active anchor measured at most once per frame.
- 100 cursors over 20 distinct anchors: one snapshot object per frame, < 2 ms scripting per pass on a mid-range laptop (benchmark, not test-gated).
- Publishing rate default 20 Hz, configurable.
- `context`/`user` are delta-encoded; full reconnect/heartbeat publishes carry the current values, including explicit `null` for empty fields.
- The optional `adaptivePublish` client option slows the publish rate when `transport.bufferedBytes()` reports a growing send buffer.
- Relay fan-out remains `senders × receivers` in a room. Relay-side rate limits, message caps, authentication, and horizontal scale are server concerns, not library transport concerns.
- Benchmark scenarios (scripted page in the demo app): 1/10/50/100 cursors × 10/100/1000 anchors, resize storm, nested scroll.

## 17. Testing

- Core (vitest, node env): validation table, clamping, sequencing incl. session change, expiry with fake timers, publisher rate limiting, codec round-trip, malformed decode, duplicate clientId, client cap.
- Dom (vitest, jsdom): registry mount/unmount/remount/duplicates/stale, normalization math, fallback chain order, resolver tiers, zero-size skip, scheduler batching (mock rAF), listener/observer cleanup.
- React (vitest, jsdom): anchor hook lifecycle incl. strict mode double-mount, useSyncExternalStore snapshots, SSR render without DOM, no-rerender guarantee for non-subscribing components.
- Cross-layout (Playwright, Chromium + Firefox + WebKit): two pages against one relay with different viewport sizes (1280×720 vs 1920×1080), sidebar expanded vs collapsed, flex wrapping (narrow vs wide), different element sizes (u/v proportionality asserted ±2 px), dialog open vs closed with a context policy, receiver-scroll repositioning without new packets (Invariant 7).

## 18. Tooling

Bun workspaces monorepo. TypeScript strict, `"type": "module"`, bundler-free builds via `tsc` per package with `exports` maps and `.d.ts`. Vitest for unit tests, Playwright for browser tests. No linter beyond `tsc --noEmit` initially (add later if needed). Packages are side-effect-free and tree-shakable (`"sideEffects": false`).

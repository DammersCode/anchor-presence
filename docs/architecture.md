# Architecture

Anchor Presence shows remote user cursors at the correct semantic position.
It does not use a canvas. It works even when two clients have different layouts.

The central invariant:

> A remote cursor represents a semantic DOM location, not an absolute screen coordinate.

## Package layers

The system has three packages. Each package adds one layer.

```text
@anchor-presence/react   provider component, hooks, SSR safety
@anchor-presence/dom     anchor registry, pointer capture, geometry scheduler, resolver
@anchor-presence/core    protocol types, validation, presence store, client orchestration
```

Dependency direction is one-way: `react → dom → core`.

- `core` has zero dependencies and no DOM globals. It runs in Node, Bun, workers, and browsers.
- `dom` depends only on `core`. It owns every browser API call: `getBoundingClientRect`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`.
- `react` is an adapter only. It holds no engine state. It subscribes to `core` and `dom` stores with `useSyncExternalStore`.

### core

Core owns the protocol, message validation, sequencing, the remote presence store, stale-presence expiry, the transport interface, the codec interface, the context-policy interface, the interpolation interface, and client orchestration.

Core imports no DOM types, no React, no transport library, and no codec library.

### dom

Dom owns the anchor registry, pointer capture, pointer target resolution, normalized coordinate math, viewport fallback, the geometry scheduler, remote anchor resolution, and visibility policies.

### react

React owns the provider component, the eight hooks, and SSR safety. Anchors are declared in the DOM with the binding's anchor attribute; React has no anchor registration helper.

## Sender to receiver flow

```text
SENDER TAB                                          RECEIVER TAB
-----------                                          ------------

pointermove event
       |
       v
walk anchor ancestors            core client
(dom: pointer.ts)                 orchestration
       |                                |
       v                                |
build CursorPosition                    |
  { anchors: [...],                     |
    viewport: {u, v} }                  |
       |                                |
       v                                |
client.updateLocalCursor()  ---------> latest-state slot
                                         |
                                         v
                                rate-limited publisher
                                (publishIntervalMs, default 50ms)
                                         |
                                         v
                                codec.encode()
                                         |
                                         v
                                transport.send() -------> [network] -------> transport.subscribe()
                                                                                    |
                                                                                    v
                                                                             codec.decode()
                                                                                    |
                                                                                    v
                                                                             validatePresence()
                                                                                    |
                                                                                    v
                                                                        remote presence store
                                                                        (sequencing, expiry)
                                                                                    |
                                                                                    v
                                                                        geometry scheduler
                                                                        (dom: scheduler.ts)
                                                                                    |
                                                            +-----------------------+-----------------------+
                                                            |                       |                       |
                                                            v                       v                       v
                                                       READ PHASE            COMPUTE PHASE            NOTIFY PHASE
                                                       measure anchors        resolve tier,          publish one
                                                       against RECEIVER       run visibility          immutable
                                                       DOM layout             policy, interpolate     snapshot
                                                            |
                                                            v
                                                   ResolvedCursor { x, y, visible, anchorId, tier }
                                                            |
                                                            v
                                                   consumer-rendered cursor (react: useRemoteCursors)
```

The sender never measures the receiver's DOM. The sender sends a semantic anchor ID and a normalized position inside it. The receiver measures its own anchors and turns that data into pixels.

## The 10 invariants

1. Absolute sender screen coordinates are never the primary cross-client positioning representation.
2. Receiver layout is authoritative.
3. Semantic anchors survive responsive layout changes.
4. Missing exact anchors degrade predictably: exact anchor, then nearest registered parent, then larger region, then viewport fallback, then visibility policy.
5. Framework adapters do not own core presence state.
6. Transport implementation is independent from cursor logic. Core imports no transport library.
7. A local layout change repositions a stationary remote cursor without a new network packet.
8. Network messages cannot execute arbitrary DOM selectors. Anchor IDs resolve only against the registered anchor map.
9. Rendering is consumer-controlled. No cursor component is required. `@anchor-presence/react` provides optional, configurable cursor components.
10. Future framework adapters (Svelte, Vue, Solid) require no architectural rewrite.

## Why receiver layout is authoritative

Two clients rarely show the same layout. Screen sizes differ. Sidebars collapse. Tables wrap. A button can sit at a different pixel position on each screen.

A sender that transmits raw pixel coordinates points at the wrong element on a receiver with a different layout. Anchor Presence avoids this by transmitting a semantic location instead: an anchor ID plus a normalized position inside that anchor.

The receiver resolves this data against its own current DOM. It measures its own anchor element with `getBoundingClientRect()` and computes a pixel position from the normalized `u`/`v` values. The result is correct for the receiver's layout, regardless of what the sender's layout looked like.

This design also makes local scrolling and resizing free. When the receiver's layout changes, the geometry scheduler re-measures the same anchor and moves the cursor. No new network message is required (Invariant 7).

See `docs/concepts.md` for anchor IDs, normalized coordinates, and fallback chains. See `docs/responsive-layouts.md` for a worked cross-layout example.

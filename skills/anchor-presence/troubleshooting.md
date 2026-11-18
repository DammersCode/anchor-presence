# Troubleshooting remote cursors

Work down this list; each symptom names its usual cause and fix.

## Cursor invisible

- The transport never connected. The provider's `factory` creates the client, and the client connects the transport by default. If you pass `autoConnect: false`, call `transport.connect()` yourself in the factory. If you never connect, `useCursorStatus()` stays `connecting`. A custom transport without `subscribeStatus` always reports `connected`, so check its own connection state instead.
- The two clients use different room keys or different codecs.
- The sender and receiver publish different `context` values and a **policy** hides the cursor — log the policy inputs first.
- The resolution **tier** is `hidden`: no anchor in the **chain** exists on the receiver and the message carried no viewport fallback. Register a shared parent anchor.

## Cursor floats over empty space

- The resolved point is inside a scroll container that clips it. Read `resolution.pointVisible` in the policy and hide, or show an "out of view" indicator instead.
- The anchor element is `display: none` on the receiver — hidden elements are skipped, so the chain falls through; check which tier actually resolved via the cursor's data attributes.

## Cursor drifts or lags during scroll and animation

- Programmatic layout changes the library cannot observe (canvas-driven layout, manual style writes outside the DOM) need a manual `invalidate()` call on the binding after the change.
- Everything observable (scroll, resize, DOM mutation, CSS transitions) re-resolves automatically; a stationary remote cursor moving with your local scroll is correct behavior, not drift.

## Cursor jumps while the pointer crosses a gap

The pointer crossed space between two anchors with no anchored parent, so the **chain** fell to the viewport position, which lands elsewhere in another layout. A layout change on one side (a collapsed sidebar, a breakpoint, a stacked grid) causes the same symptom. Mark the container (sidebar, toolbar, list) with its own anchor. Keep item sizes equal across layouts where possible. After the fix, suggest the `anchor-presence-audit` skill to find the other gaps across layouts.

## Cursor flaps between two positions

Two tabs share one `clientId`. Each of the two tabs hides the cursor of the other, and a third tab sees one cursor jump between them. In development the console warns `another client uses the clientId`. `clientId` identifies a tab; put user identity in `user` and let each tab generate its own ID.

## Works on localhost, breaks on plain http

The default ID factory uses `crypto.getRandomValues`, which works on plain http. Only a custom `idFactory` that calls `crypto.randomUUID` fails there: `crypto.randomUUID` exists only in a secure context (https or localhost). Remove the custom `idFactory`, or build the ID from `crypto.getRandomValues`.

## Cursors never appear inside an iframe

Each browsing context needs its own client — pointer and viewport coordinates do not cross iframe boundaries, regardless of origin.

## A cursor turns faint, then stays after a user leaves

A peer with no message for `idleAfterMs` (15 s default) is idle: `CursorLayer` dims it. Presence expires after the stale timeout (70 s default) without a heartbeat. Closing the pointer path (`cursor: null` on leave/blur) hides immediately; abrupt disconnects wait for expiry. Shorten `staleTimeoutMs` only above 60 s — browsers clamp hidden-tab timers to one minute, so lower values make backgrounded users flicker.

## Cursors jump instead of gliding

The user's system prefers reduced motion, so the binding snaps cursors. This is intended. A custom `interpolatorFactory` overrides it for every user.

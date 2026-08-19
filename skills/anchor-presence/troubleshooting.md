# Troubleshooting remote cursors

Work down this list; each symptom names its usual cause and fix.

## Cursor invisible

- The sender and receiver publish different `context` values and a **policy** hides the cursor — log the policy inputs first.
- The resolution **tier** is `hidden`: no anchor in the **chain** exists on the receiver and the message carried no viewport fallback. Register a shared parent anchor.
- The client never connected: check the transport's `subscribeStatus` output; a transport without `subscribeStatus` reports a constant `connected`.

## Cursor floats over empty space

- The resolved point is inside a scroll container that clips it. Read `resolution.pointVisible` in the policy and hide, or show an "out of view" indicator instead.
- The anchor element is `display: none` on the receiver — hidden elements are skipped, so the chain falls through; check which tier actually resolved via the cursor's data attributes.

## Cursor drifts or lags during scroll and animation

- Programmatic layout changes the library cannot observe (canvas-driven layout, manual style writes outside the DOM) need a manual `invalidate()` call on the binding after the change.
- Everything observable (scroll, resize, DOM mutation, CSS transitions) re-resolves automatically; a stationary remote cursor moving with your local scroll is correct behavior, not drift.

## Cursor flaps between two positions

Two tabs share one `clientId`. `clientId` identifies a tab; put user identity in `user` and let each tab generate its own ID.

## Works on localhost, breaks on plain http

`crypto.randomUUID` is secure-context-only; the default ID factory falls back automatically. If a custom `idFactory` was supplied, give it the same fallback.

## Cursors never appear inside an iframe

Each browsing context needs its own client — pointer and viewport coordinates do not cross iframe boundaries, regardless of origin.

## A cursor stays after a user leaves

Presence expires after the stale timeout (70 s default) without a heartbeat. Closing the pointer path (`cursor: null` on leave/blur) hides immediately; abrupt disconnects wait for expiry. Shorten `staleTimeoutMs` only above 60 s — browsers clamp hidden-tab timers to one minute, so lower values make backgrounded users flicker.

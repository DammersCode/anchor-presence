# Troubleshooting remote cursors

Work down this list. Each symptom names its usual cause and fix.

## Cursor invisible

- The transport never connected. The provider's `factory` creates the client, and the client connects the transport by default. If you pass `autoConnect: false`, call `transport.connect()` yourself in the factory. If you never connect, `useCursorStatus()` stays `connecting` (WebSocket transport) or `disconnected` (BroadcastChannel transport). A custom transport without `subscribeStatus` always reports `connected`, so check its own connection state instead.
- The sender is not active. When its window loses focus or the pointer leaves the page, the sender clears its cursor. Two tabs in one window never show each other a cursor. To test on one computer, open two windows side by side.
- The two clients use different room keys or different codecs.
- The sender and receiver publish different `context` values, and a **policy** hides the cursor. Log the policy inputs first.
- The resolution **tier** is `hidden`. No anchor in the **chain** exists on the receiver, and the message carried no viewport fallback. Register a shared parent anchor.

## Cursor floats over empty space

- The resolved point is inside a scroll container that clips it. Read `resolution.pointVisible` in the policy. Then hide the cursor, or show an "out of view" indicator.
- The anchor element is `display: none` on the receiver. The binding skips hidden elements, so the chain falls through to the next anchor. Read the cursor's data attributes to see which tier resolved.

## Cursor drifts or lags during scroll and animation

- The library cannot observe some layout changes, such as canvas-driven layout or style writes from code. After such a change, call `invalidate()` on the binding.
- The binding resolves again after scroll, resize, DOM mutations, and CSS transitions. A remote cursor that stays on its anchor while you scroll is correct. It is not drift.

## Cursor jumps while the pointer crosses a gap

The pointer crossed space between two anchors that have no anchored parent. The **chain** then fell back to the viewport position. In another layout, that position lands somewhere else. A layout change on one side (a collapsed sidebar, a breakpoint, a stacked grid) causes the same symptom. Mark the container (sidebar, toolbar, list) with its own anchor. Keep item sizes equal across layouts where possible. After the fix, suggest the `anchor-presence-audit` skill to find the other gaps across layouts.

## Cursor flaps between two positions

Two tabs share one `clientId`. Each of the two tabs hides the cursor of the other, and a third tab sees one cursor jump between them. In development the console warns `another client uses the clientId`. `clientId` identifies a tab. Put user identity in `user`, and let each tab generate its own ID.

## Works on localhost, breaks on plain http

The default ID factory uses `crypto.getRandomValues`, which works on plain http. Only a custom `idFactory` that calls `crypto.randomUUID` fails there: `crypto.randomUUID` exists only in a secure context (https or localhost). Remove the custom `idFactory`, or build the ID from `crypto.getRandomValues`.

## Cursors never appear inside an iframe

Each browsing context needs its own client. Pointer and viewport coordinates do not cross iframe boundaries, for any origin.

## A cursor turns faint, then stays after a user leaves

A peer is idle when its presence does not change for `idleAfterMs` (default 15 s). This is true even while its heartbeats arrive. `CursorLayer` dims an idle cursor. Presence expires when no heartbeat arrives for the stale timeout (default 70 s). If the pointer leaves or the window blurs, the client sends `cursor: null`, and the cursor hides immediately. An abrupt disconnect waits for expiry. If you shorten `staleTimeoutMs`, keep it above 60 s. Browsers limit timers in hidden tabs to one run per minute, so a lower value makes users in background tabs flicker.

## Cursors jump instead of gliding

The user's system prefers reduced motion, so the binding snaps cursors. This is intended. A custom `interpolatorFactory` overrides it for every user.

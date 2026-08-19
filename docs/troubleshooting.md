# Troubleshooting

This page covers common problems and their causes.

## Cursor not visible

Three separate causes produce the same symptom.

**The anchor is not registered.** If the sender's cursor sits over an element with no matching anchor ID on the receiver, and the fallback chain and viewport both miss, the resolution tier is `hidden`. Register the anchor with `useCursorAnchor` (React) or `registry.register()` (dom), and make sure both sender and receiver register the same anchor ID for the same semantic location.

**A visibility policy hides it.** A custom `VisibilityPolicy` can return `"hide"` for a tier that otherwise shows. Make sure the policy passed to `bindingOptions.resolution.visibilityPolicy` or `DomBindingOptions.resolution.visibilityPolicy` is not the cause. The default policy hides only the `hidden` tier; anything else hiding an `anchor` or `viewport` tier cursor is application logic. See `docs/ui-context.md`.

**The presence is stale.** The store removes a remote client after `staleTimeoutMs` (default 70 000 ms) with no message. A sender on a backgrounded tab still sends a heartbeat every `heartbeatMs` (default 10 000 ms), but a browser can clamp hidden-tab timers to one minute; a very long background period can still expire the entry. Make sure the sender tab is not fully suspended, and make sure the transport is still connected on both sides.

## Cursor floats over empty space

An anchor can be measurable while an internal scroll container clips it. The resolver sets `pointVisible` to false when the resolved point is outside the clipped area. The default policy still shows the cursor.

Hide these cursors with a custom policy:

```ts
const policy: VisibilityPolicy = ({ resolution }) =>
  !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";
```

If an overlay can cover the point, set `hitTest: true`. If the check cost is acceptable, use this option.

## Cursor drifts

A resolved cursor that slowly separates from its target element usually means a moving container is not covered by the scheduler's automatic invalidation signals.

The built-in signals cover `resize`, `scroll`, `ResizeObserver`, a `MutationObserver` on `document.body`, and CSS transition and animation events. A layout change outside all of these, for example a manual `style.transform` write driven by a `requestAnimationFrame` loop with no matching CSS transition, will not trigger a re-measure by itself.

Call the binding's `invalidate()` after any programmatic layout change the built-in signals do not cover:

```ts
binding.invalidate("custom-layout-change");
```

See `docs/performance.md` for the full signal list and when to call `invalidate()` yourself.

## HTTP vs HTTPS

`createPresenceClient` generates a `clientId` and a `session` value using an injected `idFactory`. The default factory prefers `crypto.randomUUID()`, which is available only in a secure context (HTTPS, or `localhost`). On a plain HTTP origin, `crypto.randomUUID` is absent, and the default factory falls back to `crypto.getRandomValues()`, then to a `Date.now()`/`Math.random()` combination if neither is available.

This fallback chain means client creation never throws on plain HTTP. If you need a specific ID format or an externally-issued ID, pass your own `idFactory` or a fixed `clientId` through `PresenceClientOptions`.

## Two tabs, same clientId, flapping

A `clientId` identifies a client instance, not a user. Two live tabs that share one `clientId` generate two different `session` values, because `session` is random per client instance.

The receiver's sequencing rule treats a session change as a restart: it accepts the new session's messages and resets the stored sequence number. With two tabs sharing a `clientId`, every message from either tab looks like a restart from the other tab's point of view, and the visible cursor flaps between the two tabs' positions.

This is not an error the library reports; it is a sign of misuse. Give every tab or connection its own `clientId`. Attach user identity through the `user` field instead of reusing `clientId` across tabs.

## jsdom vs real browser

Unit tests run in jsdom, which lacks real layout: `getBoundingClientRect()` always returns zeros unless a test mocks it, and `ResizeObserver` and `MutationObserver` are often absent or behave differently from a real browser.

Because of this, `dom` and `react` unit tests use injectable observer factories and mocked rects to test scheduler and resolver logic without real layout. Real cross-layout correctness (wrapping, sidebar states, element-size proportionality) is owned by the Playwright suite, which runs against Chromium, Firefox, and WebKit.

If a scheduler or resolver behavior looks correct in a jsdom unit test but wrong in the browser, suspect a jsdom API gap first: make sure the real browser has the observer or CSS feature the test mocked, and make sure the Playwright suite covers the same scenario.

# Concepts

This page defines the core vocabulary of Anchor Presence: semantic anchors, anchor IDs, normalized coordinates, fallback chains, viewport fallback, and resolution tiers.

## Semantic anchors

A semantic anchor is a DOM element that the application registers under a stable string ID. Anchors mark locations that matter, for example a button, a table row, or a sidebar link.

The sender expresses cursor position relative to an anchor, not as an absolute screen coordinate. The receiver measures its own copy of that anchor and places the cursor there.

Register an anchor with `dom`'s `AnchorRegistry`, or with the `useCursorAnchor` hook in React. See `docs/react.md` for the hook.

## Anchor IDs

An anchor ID is an opaque string, 1 to 256 characters. The application chooses the naming scheme, for example `nav.dashboard`, `stats.revenue`, or `orders.row:17.actions`.

Anchor IDs are map keys only. They never become CSS selectors, query strings, or code. A remote message cannot make the receiver look up any DOM location except through the registered anchor map. See `docs/security.md`.

Duplicate registration of one ID with a different element makes the new element win. The registry logs a warning in development builds. This keeps remount-before-unmount cases deterministic (React Strict Mode, virtualized lists).

## Normalized u/v coordinates

Each anchor point carries `u` and `v`, both in the range 0 to 1.

- `u` is the horizontal position across the anchor's width: 0 at the left edge, 1 at the right edge.
- `v` is the vertical position across the anchor's height: 0 at the top edge, 1 at the bottom edge.

The sender computes `u` and `v` from its own anchor rectangle:

```text
u = (pointerX - rect.left) / rect.width
v = (pointerY - rect.top) / rect.height
```

The receiver computes a pixel position from its own anchor rectangle and the same `u`/`v` values:

```text
x = rect.left + rect.width * u
y = rect.top + rect.height * v
```

Because both sides use a proportion of the anchor's own size, a 75% mark stays a 75% mark, even when the anchor is a different width or height on each client. See `docs/responsive-layouts.md` for a worked example.

The receiver clamps `u` and `v` to `[0, 1]` during validation. See `docs/security.md`.

## Fallback chains

A cursor position carries an ordered list of anchors, most specific first, up to 8 entries. This list is the fallback chain.

The sender builds the chain by walking up from the pointer target through registered ancestor anchors, up to `maxAnchors` (default 4, the dom constant `DEFAULT_MAX_SENT_ANCHORS`).

The receiver walks the chain in order and uses the first anchor that is connected to the DOM and has a non-zero size. This lets a cursor degrade gracefully when the exact element is missing on the receiver, for example a table row that does not exist on a shorter table.

## Viewport fallback

Every cursor position can also carry a `viewport` field: a normalized `u`/`v` position across the full browser window, computed from `pointerX / innerWidth` and `pointerY / innerHeight`.

When no anchor in the fallback chain resolves, the receiver falls back to the viewport position:

```text
x = viewport.u * innerWidth
y = viewport.v * innerHeight
```

Viewport fallback keeps a cursor visible even when every semantic anchor is missing on the receiver.

## Resolution tiers

Every resolved cursor carries a tier, one of three values:

| Tier | Meaning |
|---|---|
| `anchor` | An anchor in the fallback chain resolved. `anchorId` names the winning anchor. |
| `viewport` | No anchor resolved. The cursor used the viewport fallback position. |
| `hidden` | Nothing resolved. The cursor has no valid position. |

The resolution order is fixed: exact anchor, then nearest registered parent anchor, then a larger region anchor, then viewport fallback, then the visibility policy decides whether to show a hidden cursor at all (Invariant 4).

A visibility policy runs after tier resolution and can still hide an `anchor` or `viewport` tier cursor for application reasons. See `docs/ui-context.md`.

## Interpolation

The receiver eases a remote cursor from its last position to its new one, instead of jumping. The library ships two styles: `none` (snap) and `linear` (fixed-duration ease). Write a custom style, such as a spring, against the public `Interpolator` interface. See "Custom interpolation" in `docs/react.md` for the interface and the settled-flag rule.

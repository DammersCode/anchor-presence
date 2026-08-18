# Responsive Layouts

Anchor Presence resolves cursor positions correctly across different layouts. This page explains how wrapping, breakpoints, sidebar state, and element-size differences resolve, with a worked example.

## The problem with pixel coordinates

Two clients rarely render the same layout at the same time. A sidebar can be collapsed on one screen and open on another. A table can wrap to one column on a narrow screen and three columns on a wide screen. A button can be 160 pixels wide on one screen and 96 pixels wide on another.

A raw pixel coordinate from the sender means nothing on a receiver with a different layout. It can land on the wrong element, or on no element at all.

## The fix: normalized position inside a named anchor

The sender never sends a pixel coordinate as the primary signal. It sends:

- an anchor ID (which named element the pointer was over)
- a normalized `u`/`v` position inside that anchor's own rectangle

The receiver measures its own copy of the same anchor and computes a pixel position from the same `u`/`v` proportion. See `docs/concepts.md` for the exact formulas.

## Worked example

A sender's screen shows a button anchored as `orders.row:17.actions` at 160 pixels wide and 48 pixels tall. The pointer sits at `u = 0.75`, 75% across the button.

The receiver's screen shows a narrower layout. The same button, same anchor ID, measures 96 pixels wide and 36 pixels tall.

The receiver computes:

```text
x = rect.left + rect.width * u
  = rect.left + 96 * 0.75
  = rect.left + 72
```

The cursor lands 72 pixels from the button's left edge on the receiver. That is also 75% across the button's own width. The cursor tracks the same semantic spot on the button, not the same pixel offset.

The same logic applies to `v` and the button's height. This holds for any element-size difference: sidebar width, column count, font-size scaling, or zoom level.

## How wrapping and breakpoints resolve

A responsive layout often wraps or reflows content at a breakpoint. As long as the target element keeps its registered anchor ID, resolution works without a code change:

- The element can move to a new pixel position. The receiver re-measures it every frame the geometry scheduler runs.
- The element can change size. The `u`/`v` proportion still applies.
- The element can move between a one-column and a three-column layout. The anchor ID does not change, so the fallback chain still finds it.

## How sidebar state resolves

A collapsed sidebar and an open sidebar are different layouts on the same page. If both states register the same anchor IDs for the same semantic locations (for example `nav.dashboard`), a cursor over that item resolves correctly in either state.

If the collapsed sidebar hides an item entirely (no matching DOM element), the fallback chain moves to the next anchor, for example the sidebar container itself. See `docs/concepts.md` for fallback chains.

## How element-size differences resolve

Two clients can render the identical anchor at different sizes because of font settings, zoom, container queries, or a different viewport. Because `u`/`v` are proportions of the anchor's own rectangle, not absolute pixels, this size difference never causes a visible drift. The Playwright cross-layout test suite asserts this proportionality to within 2 pixels across different viewport sizes and sidebar states.

## When no anchor matches

If none of the anchors in the fallback chain exist on the receiver (different page, different component tree), resolution falls through to the viewport fallback, then to `hidden`. See `docs/concepts.md` for resolution tiers.

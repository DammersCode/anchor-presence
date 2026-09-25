# Scoring a view pair

`measure.mjs` scores every pair of views (A, B) of the same page, in both directions: A as the sender and B as the receiver, then the reverse. The score runs from 0 to 100; higher is worse. The weights and thresholds are fixed.

## How the script models the resolver

The script replays what the anchor-presence resolver does, from measured boxes:

- The **sender chain** for an anchor is the anchor plus its anchored ancestors, most specific first, capped at `maxAnchors` (default 4). Anchors with zero width or height are skipped, like the sender does.
- The **receiver** takes the first chain anchor it has and can measure (connected, width and height above 0) and applies the sender's normalized offset: `x = left + width × u`, `y = top + height × v`. With no chain anchor, it uses the viewport position scaled to its own viewport.
- The **fallback depth** is the index of the anchor that resolved: 0 for the exact anchor, `maxAnchors` for the viewport.
- A pointer can only reach the **visible part** of an anchor: its box clipped by every scrolling or clipping ancestor. Sender-side inputs (jump, depth, gap) use the visible part. The receiver resolves clipped anchors too, so it uses the full box.

## Inputs

| Input             | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jump_px`         | For every **adjacent pair** (X, Y) in the sender: two anchors, neither an ancestor of the other, whose boxes face each other (they overlap on one axis) no more than `adjacencyPx` (24) apart. The pointer leaves X and enters Y at the facing-edge midpoints. Each point maps through its own chain to the receiver; the jump is the receiver distance between the two mapped points. The pair counts only when X and Y are the most specific anchors at those points. The value is the 90th percentile over all pairs in both directions. |
| `gap_uncovered`   | A **container** is the box around sibling anchors that share one nearest anchored ancestor (or none). The script samples a grid of points inside the visible part of each container with two or more anchors. A point is uncovered when the element under it (`elementFromPoint`) has no anchored ancestor. Below the fold, the script tests the anchor boxes instead. The view's value is the area-weighted uncovered share; the pair takes the worse view. Range 0–1.                                                                     |
| `depth_delta`     | For every reachable anchor in the sender, the receiver's fallback depth. The sender's own depth is always 0. The pair takes the worst anchor in both directions. Range 0–`maxAnchors`.                                                                                                                                                                                                                                                                                                                                                      |
| `aspect_amp`      | For every anchor measurable in both views: `max(ratio_A, ratio_B) / min(ratio_A, ratio_B)`, where `ratio = width / height`, clamped at 10. The pair takes the 90th percentile.                                                                                                                                                                                                                                                                                                                                                              |
| `presence_parity` | An anchor ID has parity 1 when it is measurable in both views, 0 when it is measurable in one view only. The score uses `1 - presence_parity`, averaged over all anchor IDs of the pair: the share of IDs missing in one view.                                                                                                                                                                                                                                                                                                              |

## Sub-scores

Each sub-score is capped-linear, from 0 to 100:

```
score(x, good, poor) = clamp(100 * (x - good) / (poor - good), 0, 100)
```

| Sub-score | x                                | good  | poor                     |
| --------- | -------------------------------- | ----- | ------------------------ |
| Jump      | `jump_px` (p90, both directions) | 40 px | 240 px                   |
| Gap       | `gap_uncovered`                  | 0.05  | 0.40                     |
| Depth     | `depth_delta`                    | 0     | `maxAnchors` (default 4) |
| Aspect    | `aspect_amp`                     | 1.3   | 3.0                      |
| Parity    | `1 - presence_parity`            | 0     | 1                        |

## Total and bands

```
risk_0_100 = round(0.35 * Jump + 0.25 * Gap + 0.15 * Depth + 0.15 * Aspect + 0.10 * Parity)
```

| Total  | Band     |
| ------ | -------- |
| 0–20   | low      |
| 21–50  | moderate |
| 51–100 | high     |

A pair with full anchor coverage and every anchor in both views tops out at 50 (Jump and Aspect at 100). A high band always involves gaps, deep fallbacks, or missing anchors.

## Reading each sub-score

- **Jump** is the symptom users see: a few pixels of pointer movement on one screen sweep the remote cursor across the other screen. It rises when neighbors change places: a row that stacks, a table that becomes cards, a grid that reflows, columns that turn into rows. Sibling reordering shows up here and nowhere else. The report lists the worst moves as `from -> to`, with the sender's distance and the receiver's distance.
- **Gap** means the pointer can cross space with no anchored parent. The chain then falls to the viewport position, which lands elsewhere in another layout. The report names the container (by its anchored parent, or "no anchored parent") and one element found in the gap.
- **Depth** means an anchor in one view resolves only through an ancestor in the other. Depth 1 lands on the parent box: acceptable when the parent is small. Depth `maxAnchors` is the viewport: the worst case. The report lists which anchor resolved.
- **Aspect** means an anchor changes shape. The same `u`/`v` offset then lands in a visibly different spot inside the element, for example the left edge of a stretched full-width button, far from its label. Full-width containers follow the viewport's own shape change; small anchors with a high value are the real findings.
- **Parity** is the share of anchor IDs that exist in one view only. It explains depth: each missing ID forces a fallback. A high parity with a low depth means the missing anchors have a close parent that stays.

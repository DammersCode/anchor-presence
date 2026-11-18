# Fix catalogue

Each fix names the sub-scores it lowers. Pick fixes by the pair's highest sub-scores, then turn each one into a concrete edit. Name the file and line of the offender, and the changed markup or class names.

| Fix                                                | Lowers        | Signal in the report                                            |
| -------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| Anchor the container                               | Gap, Jump     | Uncovered container, "no anchored parent", jumps via `viewport` |
| Keep item sizes equal across breakpoints           | Aspect        | Small anchors with an aspect of 1.5x or more                    |
| Square icon items in a collapsed nav               | Aspect        | Nav items: wide on one view, square icons on the other          |
| Keep the order and the axis stable                 | Jump          | Large jumps between siblings of one parent                      |
| Same anchor IDs in collapsed and expanded variants | Parity, Depth | IDs missing in one state, fallbacks from a variant's items      |
| Split a large anchor into child anchors            | Jump, Aspect  | One large anchor in many jumps, content reflows inside it       |
| Do not anchor decorative wrappers                  | Depth         | Chains full of layout wrappers, fallbacks land on a wrapper     |
| Breakpoints that keep proportions                  | Aspect, Jump  | Many anchors change shape at one breakpoint                     |
| Keep the parent of a hidden anchor anchored        | Depth         | Fallbacks that skip two levels or reach `viewport`              |

## Anchor the container

A pointer that crosses a gap between two anchors with no anchored parent resolves at the viewport tier. Give the container its own anchor, so the gap resolves against the container.

```tsx
<nav data-anchor="nav">
  <a data-anchor="nav.home">Home</a>
  <a data-anchor="nav.orders">Orders</a>
</nav>
```

Name the container for what it is, such as `nav`, `toolbar`, or `orders`, not for where it sits.

## Keep item sizes equal across breakpoints

The receiver applies the sender's `u`/`v` to its own box. A button can be 80 px wide in one view and stretched to 250 px in the other. Then a point near its edge lands far from its label. Keep intrinsic widths where the layout stacks. Use `items-start` or `items-end` on a flex column instead of the default stretch. Use a fixed `w-*` on icon buttons and the same padding in both views.

## Square icon items in a collapsed nav

A labeled nav item is wide and short. The icon-only item in a collapsed nav is often a narrow strip. Make the collapsed item a square around the icon (`size-10`, `aspect-square`), and anchor the same element in both states.

## Keep the order and the axis stable

A jump is large when two neighbors in one view sit apart in the other. A row that stacks, cells that move into a card, or a grid that reflows its spans can cause this. Where the design allows it:

- wrap a row instead of stacking it, because `flex-wrap` keeps neighbors on one line as long as they fit.
- keep the reading order of fields when a table becomes cards, and keep adjacent cells adjacent in the card.
- keep grid spans and column order across breakpoints, and change only the column count.
- keep a column a column. Turn columns into a horizontal scroller before turning them into rows.

If the difference is the design itself, for example a table that becomes cards on purpose, say so in the proposal. The fix then targets the worst neighbors only.

## Same anchor IDs in collapsed and expanded variants

If a component renders two variants, such as a collapsed and an expanded sidebar, give each item the same anchor ID in both. The receiver then finds the exact anchor in either state, and the depth for that item drops to 0.

```tsx
const id = `nav.${item.key}`;
return collapsed ? <IconLink data-anchor={id} /> : <LabeledLink data-anchor={id} />;
```

Do not put two variants with one ID in the DOM at the same time. One ID maps to one live element.

## Split a large anchor into child anchors

A large anchor with no children reports one ID for its whole area. If its content reflows between views, the same `u`/`v` points at different content. Anchor the meaningful children, such as the chart, the legend, and each bar, so the receiver resolves a small box first.

## Do not anchor decorative wrappers

The chain carries at most `maxAnchors` IDs (default 4). A wrapper anchor, such as a padding `div` or a grid shell, spends a slot and gives a fallback target that means nothing. Remove the anchor from the wrapper and keep it on the meaningful parent.

## Breakpoints that keep proportions

A breakpoint that turns a 4-column grid into 1 column changes every card's shape at once. Prefer breakpoints that step the column count down gradually (4, 2, 1), and container sizes that keep card aspect ratios close.

## Keep the parent of a hidden anchor anchored

If one view drops an anchor, the cursor falls back to the nearest ancestor that remains. A narrow table without its action column or a filtered list can drop an anchor. Give the remaining parent its own anchor, for example `orders.row:<id>`, then `orders`. Then the fallback lands one step up and not on the viewport.

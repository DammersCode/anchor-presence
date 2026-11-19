# Choosing anchor IDs

An **anchor** ID names what an element means, never where it sits. IDs survive redesigns, wrapping, and reordering. DOM paths and indexes do not.

## ID conventions

- Build IDs as dot-separated paths, from most general to most specific: `orders`, `orders.table`, `orders.row:42`, `orders.row:42.actions.delete`.
- If rows reorder or paginate, give each row its domain identity (`orders.row:ORD-1042` or a database ID). Never use a render index.
- One ID maps to one live element. A duplicate registration replaces the previous element and logs a development warning. This is correct for a remount. It is wrong for two elements that exist at the same time.
- Mark a parent for every specific anchor. The sent **chain** carries up to `maxSentAnchors` IDs (default 4, at most 8), most specific first. The receiver resolves the first ID that it has.

## How resolution degrades

```
exact anchor → next anchor in the chain (parent, then larger region) → viewport position → policy decides
```

Sometimes the receiver does not have the exact anchor. Examples are a virtualized row that scrolled out, a closed dialog, or a different responsive layout. Then the cursor lands on the nearest parent that the receiver has. If no anchor resolves, the normalized viewport position places the cursor approximately. The **policy** sees which **tier** resolved: `anchor`, `viewport`, or `hidden`. A parent anchor is still tier `anchor`. The policy can hide the cursor instead.

## Where to register

Mark anchors on: navigation items, cards, table rows and their action cells, dialog bodies and their controls, and any element a user would say "look here" about. Skip decorative wrappers. One meaningful parent in the chain is better than four vague ones.

## Private regions

Mark a sensitive element with `data-anchor-private` (or the name in the `privateAttribute` option). Over it and its descendants the binding sends no cursor, not even the parent anchor.

## Registration mechanics

Declare anchors with the binding's anchor attribute. The default is `data-anchor`. A binding can set another attribute with `anchorAttribute`. A row anchor looks like this:

```tsx
<div data-anchor={`orders.row:${order.id}`}>{/* row content */}</div>
```

Changing the attribute value re-registers the element under the new ID. Removing the attribute or the element unregisters the anchor. The binding ignores empty values.

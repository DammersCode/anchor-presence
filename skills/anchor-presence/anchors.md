# Choosing anchor IDs

An **anchor** ID names what an element means, never where it sits. IDs survive redesigns, wrapping, and reordering; DOM paths and indexes do not.

## ID conventions

- Hierarchical, dot-separated, most general to most specific: `orders`, `orders.table`, `orders.row:42`, `orders.row:42.actions.delete`.
- Use domain identity for list rows (`orders.row:ORD-1042` or a database ID), never a render index, when rows reorder or paginate.
- One ID maps to one live element. A duplicate registration replaces the previous element and logs a development warning — intended for remounts, wrong for two simultaneous elements.
- Register a parent for every specific anchor. The transmitted **chain** carries up to four IDs, most specific first; the receiver resolves the first one it has.

## How resolution degrades

```
exact anchor → registered parent → larger region → viewport position → policy decides
```

A receiver missing the exact anchor (virtualized row scrolled out, dialog closed, different responsive branch) lands on the nearest parent it does have. With no anchor at all, the normalized viewport position places the cursor approximately. The **policy** sees which **tier** resolved and can hide instead.

## Where to register

Register anchors on: navigation items, cards, table rows and their action cells, dialog bodies and their controls, and any element a user would say "look here" about. Skip decorative wrappers — a chain of one meaningful parent beats four vague ones.

## Registration mechanics

`useCursorAnchor(id)` returns a stable ref callback. In lists, call the hook inside a per-row component — hooks cannot run inside a `.map()` loop. Changing the `id` re-registers the element under the new ID automatically.

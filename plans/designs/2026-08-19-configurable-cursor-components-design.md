# Configurable Cursor Components

Date: 2026-08-19

Baseline commit: `9687cde`

Status: Approved through owner-selected recommended defaults

## Goal

Add optional cursor components to `@anchor-presence/react`.

Keep all cursor visuals configurable by the consumer.

Keep demo-specific behavior in `apps/demo`.

Use npm as the only installation method. Do not add a shadcn registry.

## Package Boundaries

`@anchor-presence/core` stays headless and has no changes.

`@anchor-presence/dom` stays headless and has no changes.

`@anchor-presence/react` adds `CursorLayer` and `DefaultCursor`.

The React package does not add a UI configuration context.

The existing `LiveCursorProvider` API does not add visual properties.

The demo keeps its transport, room, identity, visibility policy, spring interpolator, and presence indicator.

## Configuration Layers

The public API has three configuration layers.

1. `createPresenceClient` configures protocol and client behavior.
2. `LiveCursorProvider.bindingOptions` configures DOM resolution behavior.
3. `CursorLayer` properties configure cursor rendering.

Do not add one configuration object that combines these layers.

## Public API

Export these runtime values from `@anchor-presence/react`:

```ts
export { CursorLayer, DefaultCursor };
```

Export these public types:

```ts
export type {
  CursorLayerProps,
  CursorRenderProps,
  DefaultCursorProps,
};
```

Use this API shape:

```ts
type CursorRenderProps<TContext = unknown, TUser = unknown> = {
  cursor: ResolvedCursor<TContext, TUser>;
  label: ReactNode;
  color: string;
};

type CursorLayerProps<TContext = unknown, TUser = unknown> = {
  getLabel?: (cursor: ResolvedCursor<TContext, TUser>) => ReactNode;
  getColor?: (cursor: ResolvedCursor<TContext, TUser>) => string;
  filterCursor?: (cursor: ResolvedCursor<TContext, TUser>) => boolean;
  getCursorProps?: (
    cursor: ResolvedCursor<TContext, TUser>,
  ) => Omit<ComponentPropsWithoutRef<"div">, "children">;
  renderCursor?: (props: CursorRenderProps<TContext, TUser>) => ReactNode;
};
```

Use this property shape for `DefaultCursorProps`:

```ts
type DefaultCursorProps = {
  label?: ReactNode;
  color?: string;
  className?: string;
  style?: CSSProperties &
    Partial<
      Record<
        | "--anchor-presence-cursor-color"
        | "--anchor-presence-cursor-size"
        | "--anchor-presence-cursor-label-color",
        string
      >
    >;
  labelClassName?: string;
  labelStyle?: CSSProperties;
};
```

Do not add an icon property. Consumers can use `renderCursor` to replace all cursor contents.

## CursorLayer Behavior

`CursorLayer` calls `useRemoteCursors` once.

The component does not render a cursor when `cursor.visible` is false.

If `filterCursor` exists, the component applies it after the visibility check.

If `getLabel` does not exist, the component uses `null`.

If `getColor` does not exist, the component uses `#6b7280`.

The component does not read fields from `cursor.user`.

The component renders one fixed-position `div` for each remaining cursor.

The package controls these root style values:

- `position`
- `left`
- `top`
- `transform`
- `pointerEvents`

Consumer styles cannot replace these geometry values.

Consumer styles can replace non-geometry values, including `zIndex`.

The default `zIndex` value is `50`.

The root has `aria-hidden="true"` because animated cursors are decorative.

The root includes these stable data attributes:

- `data-anchor-presence-cursor`
- `data-anchor-presence-client-id`
- `data-anchor-presence-tier`
- `data-anchor-presence-anchor`

`getCursorProps` can add classes, styles, HTML attributes, and test attributes.

Package-owned geometry, accessibility, and identity attributes take precedence.

If `renderCursor` does not exist, the root renders `DefaultCursor`.

If `renderCursor` exists, its result replaces only the root contents.

React errors from consumer callbacks propagate through the normal React error boundary.

## DefaultCursor Behavior

`DefaultCursor` has no Tailwind dependency and no external CSS file.

The component renders a small SVG pointer.

The component renders no label when `label` is `null` or `undefined`.

The default color is neutral gray.

The default size is `20px`.

The default label color is white.

The component supports these CSS variables:

- `--anchor-presence-cursor-color`
- `--anchor-presence-cursor-size`
- `--anchor-presence-cursor-label-color`

Explicit style variables take precedence over the `color` property.

Consumers can replace the complete visual with `renderCursor`.

## Demo Integration

Keep `apps/demo/src/cursors/CursorLayer.tsx` as the demo adapter.

Rename its local visual component to `DemoCursor`.

Render the package `CursorLayer` inside the demo adapter.

Map the demo user name through `getLabel`.

Map the validated demo palette through `getColor`.

Use `renderCursor` for the existing SVG and label design.

Use `getCursorProps` to preserve the current end-to-end test attributes.

Do not move these files into the package:

- `apps/demo/src/cursors/PresencePill.tsx`
- `apps/demo/src/cursors/setup.ts`
- `apps/demo/src/cursors/transport.ts`
- `apps/demo/src/cursors/visibilityPolicy.ts`
- `apps/demo/src/cursors/interpolators.ts`

## Specification and Documentation

Update `SPECIFICATION.md` because this change adds public React APIs.

Keep Invariant 9. Change its text to permit optional cursor components.

The invariant must state that no cursor component is required.

Document the new components in these files:

- `README.md`
- `packages/react/README.md`
- `docs/react.md`

Show the default cursor first. Then show label, color, filter, root property, and custom renderer examples.

State that all remote `user` data is untrusted.

Tell consumers to validate values before they return a color or render user data.

## Security and Accessibility

Do not use `dangerouslySetInnerHTML`.

Render labels as React nodes.

Do not read arbitrary color values from `cursor.user`.

Keep the animated cursor roots outside the accessibility tree.

Use a separate presence component for accessible connection and participant status.

## Performance

Only `CursorLayer` subscribes to resolved cursor frames.

Do not put rendering configuration in `LiveCursorProvider` context.

Do not add a second external store.

Do not clone cursor snapshots.

Run mapping callbacks only for visible cursors that pass `filterCursor`.

Preserve the existing sibling render isolation.

## Tests

Add React unit tests for these cases:

1. The default component renders a neutral pointer without a label.
2. `getLabel` and `getColor` change the default visual.
3. `renderCursor` replaces only the root contents.
4. The root keeps package geometry after consumer style input.
5. `getCursorProps` adds classes and test attributes.
6. Hidden cursors do not render.
7. `filterCursor` removes selected visible cursors.
8. A null provider snapshot renders no cursors during server rendering.
9. Cursor updates do not render a sibling component.

Keep the current end-to-end selectors and behavior.

Run the existing browser performance gate after the demo migration.

## Version Decision

The npm registry did not contain the three packages on 2026-08-19.

Keep version `0.1.0` if the packages stay unpublished during implementation.

If a package is published before implementation, stop and report the version change requirement.

## Non-Goals

- Do not add a shadcn registry.
- Do not add a new UI package.
- Do not add a visual configuration provider.
- Do not change core, DOM, transport, codec, or protocol behavior.
- Do not move `PresencePill` into the package.
- Do not add click or selection presence.
- Do not add a framework adapter.
- Do not add a CSS dependency.

## Success Criteria

The package renders a usable neutral cursor with only `<CursorLayer />`.

Consumers can replace all visible cursor contents through `renderCursor`.

Consumers can configure labels, colors, filtering, root classes, and non-geometry root styles.

The demo preserves its current visual design and browser-test selectors.

All existing verification gates remain green.

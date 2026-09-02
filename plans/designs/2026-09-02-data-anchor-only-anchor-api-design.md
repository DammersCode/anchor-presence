# Data-Attribute-Only Anchor API

Date: 2026-09-02

Baseline commit: `de490cd`

Status: Approved through owner-selected recommended defaults

## Goal

Make the DOM attribute the only public way to declare an anchor.

Remove parallel pre-public anchor APIs before they become compatibility burden.

Keep the public API lean:

- one concept: an element with an anchor attribute is an anchor
- one binding entry point: `createDomBinding`
- one React pattern: render the attribute, do not call an anchor hook
- one configurable attribute name per binding

## Context

The project currently exposes multiple ways to create anchors:

- React `useCursorAnchor(id)`
- `binding.registry.register(id, element)`
- `createAnchorRegistry()`
- opt-in `autoRegister` for `data-anchor`
- lower-level pointer, scheduler, resolver, and geometry exports

This creates two mental models: manual registration and attribute registration. Since the project is not public yet, we can remove the manual model instead of deprecating it.

## Decisions

- Anchors are declared by a DOM attribute.
- The default attribute is `data-anchor`.
- Auto-registration is always active.
- There is no public `autoRegister` flag.
- There is no public `autoRegisterAttribute` option.
- There is no public `useCursorAnchor` hook.
- There is no public `registry.register` method.
- There is no public `createAnchorRegistry` export.
- Lower-level anchor, pointer, scheduler, resolver, and geometry plumbing stays internal.
- `data-anchor`, or the configured attribute, is strictly semantic.
- E2E tests use `data-testid` for test-only locators.
- Existing deprecated or unnecessary APIs are removed instead of marked deprecated.

## Configurable Anchor Attribute

Each binding can configure one anchor attribute:

```ts
const binding = createDomBinding(client, {
  anchorAttribute: "data-presence",
});
```

React passes the same option through `bindingOptions`:

```tsx
<LiveCursorProvider
  client={client}
  bindingOptions={{ anchorAttribute: "data-presence" }}
>
  <main data-presence="main">…</main>
</LiveCursorProvider>
```

Rules:

- Default is `"data-anchor"`.
- The attribute name is set once per binding.
- The binding watches only the configured attribute.
- The attribute value is the anchor ID.
- The attribute name may be any valid DOM/CSS attribute name.
- `"id"` is allowed, so existing UIs with stable `id` values can adopt Anchor Presence without adding a new attribute.
- The implementation should accept names matching `/^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/`.
- Invalid attribute names throw `TypeError`.
- When `anchorAttribute` is `"id"`, every element with a non-empty `id` becomes an anchor.

## Empty Attribute Values

An element is registered only when the configured attribute has a non-empty value after trimming.

Empty or whitespace-only values are ignored.

Development behavior:

- warn once for the offending element and attribute
- do not generate fallback IDs
- do not use the element `id` as an implicit anchor ID unless `anchorAttribute` is explicitly `"id"`

Production behavior:

- ignore empty values silently
- do not spam the console

## `maxAnchors`

`maxAnchors` does not limit the number of registered anchors.

It limits the outbound fallback chain sent with each local cursor sample.

If the pointer is over nested anchors, the sender sends the innermost anchor first, then registered ancestor anchors, up to `maxAnchors` entries.

Example:

```html
<main data-anchor="main">
  <table data-anchor="orders">
    <tr data-anchor="orders.row:12">
      <td data-anchor="orders.row:12.actions">
        <button data-anchor="orders.row:12.actions.delete">
```

With `maxAnchors: 4`, a pointer over the button sends:

```ts
[
  "orders.row:12.actions.delete",
  "orders.row:12.actions",
  "orders.row:12",
  "orders",
]
```

The receiver tries the chain from specific to general and uses the first anchor that exists and has a measurable size.

This keeps remote cursors robust when the exact anchor is missing on the receiver because of responsive layout, virtualized rows, dialogs, component variants, or app version differences.

API rules:

- `maxAnchors` remains a public `DomBindingOptions` field.
- Default is `4`.
- Provided values must be finite integers.
- Valid values are clamped to `1` through `8`.
- Non-finite or non-integer values throw `TypeError`.
- The protocol hard limit remains `8`.

## Duplicate Anchor IDs

If two different elements register the same anchor ID:

- the newest registration wins
- the older element remains in the DOM but is not active for that anchor ID
- if the newer element is removed, auto-registration may reclaim the ID for the older live element
- development logs one `console.warn` per anchor ID per binding
- the warning includes the anchor ID and references to the previous and next element
- production remains silent

## Public API

### `@anchor-presence/dom`

Public runtime exports:

```ts
export { createDomBinding } from "./binding";
export { createWebSocketTransport } from "./transport";
```

Public type exports:

```ts
export type {
  DomBinding,
  DomBindingOptions,
  EnvironmentOptions,
  ResolutionOptions,
} from "./binding";

export type {
  ResolvedCursor,
  ResolutionTier,
  VisibilityPolicy,
} from "./resolver";

export type { WebSocketTransportOptions } from "./transport";
```

`DomBindingOptions`:

```ts
type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  anchorAttribute?: string;
  maxAnchors?: number;
  resolution?: ResolutionOptions<TContext, TUser>;
  environment?: EnvironmentOptions;
};
```

`DomBinding`:

```ts
type DomBinding<TContext = unknown, TUser = unknown> = {
  invalidate(reason?: string): void;
  getSnapshot(): ResolvedCursor<TContext, TUser>[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
};
```

Not public:

- `createAnchorRegistry`
- `AnchorRegistry`
- `attachPointerSource`
- `PointerSourceOptions`
- `PointerSourceHandle`
- `DEFAULT_MAX_ANCHORS`
- `DEFAULT_MAX_SENT_ANCHORS`
- `createGeometryScheduler`
- scheduler option and callback types
- `RemoteResolver`
- `resolveGeometry`
- `findResolvableAnchor`
- `defaultVisibilityPolicy`
- `Rect`
- `ViewportSize`
- `computeVisibleRect`
- `isPointInRect`
- `StyleValues`

`defaultVisibilityPolicy` may remain an internal implementation detail. Consumers configure behavior through `resolution.visibilityPolicy`.

### `@anchor-presence/react`

Remove:

```ts
export { useCursorAnchor } from "./hooks";
```

Keep the remaining provider, hooks, cursor components, and re-exported consumer types.

`LiveCursorProvider` continues to create a binding automatically when no `binding` prop is passed. The automatically created binding always uses attribute-based auto-registration.

## Auto-Registration Behavior

`createDomBinding`:

1. creates an internal anchor registry
2. scans `environment.root`, default `document`, for the configured attribute
3. registers every element with a non-empty trimmed attribute value
4. observes `childList`, `subtree`, and attribute changes for the configured attribute
5. registers newly added elements
6. updates elements whose attribute value changes
7. unregisters elements whose attribute is removed
8. unregisters elements removed from the observed root

Attribute changes:

- attribute added: register the element
- value changed: unregister the old ID and register the new ID
- attribute removed: unregister the element
- element removed: unregister the element

No generated IDs are created.

No explicit registration precedence exists because manual registration is no longer part of the public binding API.

## Internal Architecture

The internal modules remain:

- `registry.ts`
- `autoRegister.ts`
- `pointer.ts`
- `scheduler.ts`
- `resolver.ts`
- `geometry.ts`
- `occlusion.ts`

They are implementation details of `createDomBinding`.

`autoRegister.ts` becomes simpler:

- no `explicit` WeakSet
- no `resync` requirement from manual registration
- no public or required `onAutoRegistered` / `onAutoUnregistered` callbacks
- no generated `auto-N` IDs
- configurable attribute name
- empty-value warning logic

`binding.ts` no longer wraps the registry to track explicit registrations.

`pointer.ts` still uses the internal registry to build the outbound fallback chain.

`resolver.ts` still uses the internal registry to resolve remote cursor anchors.

## Demo and Example Migration

Migrate all consumers from `useCursorAnchor` to the anchor attribute.

Affected areas:

- `apps/demo`
- `examples/socketio/client`
- `examples/signalr/client`

Migration rules:

- replace `const ref = useCursorAnchor(id)` with `data-anchor={id}` on the target element
- keep the rendered anchor ID values stable
- keep `data-testid` values stable where E2E tests depend on them
- move E2E locators from `data-anchor` to `data-testid` when the attribute was used only as a test locator
- keep `data-anchor` when the element is a real semantic anchor
- `BenchCell` uses `data-anchor={anchorId}`
- `PresencePill` keeps semantic presence anchors and gains stable `data-testid` values for E2E

## Documentation Updates

Update:

- `README.md`
- `SPECIFICATION.md`
- `docs/concepts.md`
- `docs/react.md`
- `docs/troubleshooting.md`
- `docs/architecture.md` if it references manual registration or lower-level exports
- `packages/dom/README.md`
- `packages/react/README.md`
- `skills/anchor-presence/SKILL.md`
- `skills/anchor-presence/anchors.md`
- `skills/anchor-presence/troubleshooting.md`
- `FEATURES-REVIEW.md`

The docs must present one public story:

```tsx
<main data-anchor="main">…</main>
```

or, with a custom attribute:

```tsx
<main data-presence="main">…</main>
```

Manual registry examples must be removed from public documentation.

## Testing Strategy

Unit tests:

- `autoRegister` registers elements with the default attribute
- `autoRegister` registers elements with a custom attribute
- `autoRegister` ignores empty and whitespace-only values
- `autoRegister` updates anchors when attribute values change
- `autoRegister` unregisters when attributes are removed
- `autoRegister` unregisters when elements are removed
- duplicate IDs warn in development and last registration wins
- `createDomBinding` validates `anchorAttribute`
- `createDomBinding` clamps `maxAnchors`
- `createDomBinding` no longer exposes `registry`

React tests:

- remove `useCursorAnchor` tests
- update fake binding utilities to match the new `DomBinding` type
- keep provider, cursor, context, presence, and remote-user tests green

E2E:

- update locators that used `data-anchor` only for testing
- verify presence count and cross-layout scenarios still pass

## Verification Gates

Run:

```sh
bunx vitest run
bunx tsc --build packages/core packages/dom packages/react
cd apps/demo; bunx vite build
bunx oxlint --type-aware
```

Run affected Playwright tests when browser verification is needed:

```sh
bunx playwright test
```

## Commit Strategy

Recommended focused commits:

1. `document data-attribute-only anchor api design`
2. `make anchor attribute the only public anchor api`
3. `migrate demo and examples to anchor attribute`
4. `update progress for anchor attribute cleanup`

Do not commit the untracked `FEATURES-REVIEW.md` unless the owner explicitly asks.

## Out of Scope

- No global library configuration.
- No support for multiple anchor attributes per binding.
- No visible duplicate-ID DOM markers.
- No production console warnings for duplicate IDs.
- No typed anchor ID generic in the library.
- No deprecation shims.
- No public manual anchor registry.

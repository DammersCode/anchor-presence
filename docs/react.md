# React Adapter

`@anchor-presence/react` provides a provider component, eight hooks, and two optional cursor components. It holds no engine state; it subscribes to `core` and `dom` stores with `useSyncExternalStore`.

## Install

```sh
bun add @anchor-presence/react @anchor-presence/dom @anchor-presence/core
```

## LiveCursorProvider

```tsx
import { LiveCursorProvider } from "@anchor-presence/react";
import type { LiveCursorProviderProps } from "@anchor-presence/react";
```

```ts
type LiveCursorProviderProps<TContext = unknown, TUser = unknown> = {
  client: PresenceClient<TContext, TUser> | null;
  binding?: DomBinding<TContext, TUser>;
  bindingOptions?: DomBindingOptions<TContext, TUser>;
  children?: ReactNode;
};
```

Pass a `PresenceClient` created with `createPresenceClient` from `@anchor-presence/core`. The provider creates a `DomBinding` for the client automatically, unless you pass one yourself through `binding`.

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { LiveCursorProvider } from "@anchor-presence/react";

const client = createPresenceClient({ transport: myTransport });

function App() {
  return (
    <LiveCursorProvider client={client}>
      <Dashboard />
    </LiveCursorProvider>
  );
}
```

`bindingOptions` configures the automatically created binding. The binding always watches the configured anchor attribute. The default attribute is `data-anchor`; pass `bindingOptions.anchorAttribute` to use another existing attribute, for example `data-presence` or `id`.

It has four parts:

```ts
type DomBindingOptions<TContext = unknown, TUser = unknown> = {
  anchorAttribute?: string;
  maxAnchors?: number;
  resolution?: { visibilityPolicy?; interpolatorFactory?; hitTest? };
  environment?: { root?; window?; raf?; caf?; ResizeObserverCtor?; MutationObserverCtor? };
};
```

`resolution` controls how remote cursors turn into screen positions. `environment` supplies the DOM and timing hosts, and each field defaults to the ambient browser global. The provider reads `bindingOptions` only once, at binding creation. Later changes to the object do not recreate the binding.

Pass `client={null}` during server-side rendering. See "SSR" below.

## Hooks

| Hook | Returns |
|---|---|
| `usePresenceClient({ factory, key? })` | a stable `PresenceClient` per `key`, or `null` before the mount effect runs |
| `useRemoteUsers()` | one entry per remote client: `clientId`, `user`, and `session` |
| `useRemoteCursors()` | `ResolvedCursor[]` snapshot |
| `useRemoteCursorsSelector(select, isEqual?)` | a value derived from the snapshot |
| `useCursorPresence()` | raw remote `RemotePresence<TContext, TUser>[]` |
| `useCursorStatus()` | `ConnectionStatus` |
| `useCursorClient()` | the `PresenceClient` instance, or `null` |
| `useCursorContext()` | `[context, setContext]` |

### Render cost

Each hook rerenders its component only when the value it returns changes.

- `useRemoteCursors` rerenders on every resolved-cursor snapshot. While cursors move, that is every frame. Derive a smaller value with `useRemoteCursorsSelector` when your component needs less.
- `useRemoteCursorsSelector` rerenders only when the `select` output changes under `isEqual`.
- `useRemoteUsers` rerenders only when the set of remote clients, or their `user` or `session`, changes.
- `useCursorPresence` rerenders only when a remote client's `cursor`, `context`, `user`, `pointer`, `session`, or membership changes. A message that only advances `sequence` does not rerender it.
- `useCursorStatus` rerenders only when the connection status changes.
- `useCursorContext` rerenders only when the local context value changes.

An idle room costs nothing: no inbound messages, no rerenders.

### Anchor elements

Anchors are declared with the binding's anchor attribute.

```tsx
<button data-anchor="nav.dashboard">Dashboard</button>
```

In list rows, give each row a unique anchor ID built from its own data.

```tsx
<tr data-anchor={`orders.row:${order.id}`}>
  <td>{order.customer}</td>
  <td>
    <button data-anchor={`orders.row:${order.id}.actions`} onClick={() => onView(order.id)}>
      View
    </button>
  </td>
</tr>
```

### useRemoteCursors

```ts
function useRemoteCursors<TContext = unknown, TUser = unknown>(): ResolvedCursor<TContext, TUser>[];
```

Returns the current resolved-cursor snapshot: `{ clientId, x, y, visible, pointVisible, anchorId, tier, context?, user? }[]`. Values are receiver-viewport pixels. Position with `position: fixed`.

Cursor movement updates flow only to components that call this hook. The provider never rerenders the rest of the app tree per cursor frame.

### useRemoteCursorsSelector

```ts
function useRemoteCursorsSelector<TSelected, TContext = unknown, TUser = unknown>(
  select: (cursors: ResolvedCursor<TContext, TUser>[]) => TSelected,
  isEqual?: (a: TSelected, b: TSelected) => boolean, // default Object.is
): TSelected;
```

`useRemoteCursors` rerenders its component on every cursor frame, because each frame publishes a new array. Use this hook when a component needs a small derived value instead of the full snapshot. It applies `select` to each snapshot and rerenders only when `isEqual` reports the selected value changed.

Keep `select` and `isEqual` stable across renders. Declare them at module level, or wrap them in `useCallback`.

A presence indicator needs only the set of clients whose cursor is clipped out of view. Cursors move every frame, but that set changes rarely:

```tsx
function selectClippedClientIds(cursors: ResolvedCursor[]): ReadonlySet<string> {
  const clipped = new Set<string>();
  for (const cursor of cursors) {
    if (cursor.tier === "anchor" && !cursor.pointVisible) clipped.add(cursor.clientId);
  }
  return clipped;
}

function sameClientIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function PresencePill() {
  const clipped = useRemoteCursorsSelector(selectClippedClientIds, sameClientIds);
  return <span>{clipped.size} out of view</span>;
}
```

`select` builds a new `Set` each frame, so the default `Object.is` would rerender every frame. The `sameClientIds` comparison stops that. When the membership is unchanged, the hook returns the previous `Set` reference, which also keeps any dependent `useMemo` or `memo` stable.

### useCursorPresence

```ts
function useCursorPresence<TContext = unknown, TUser = unknown>(): RemotePresence<TContext, TUser>[];
```

Returns the raw remote presence list, before geometry resolution. Use this only when you need fields resolution does not carry, such as `pointer.type`. Use `useRemoteCursors` for rendering instead.

The list is a stable snapshot. It changes only when a remote client's `cursor`, `context`, `user`, `pointer`, `session`, or membership changes. The `sequence` field is not included. It is a wire-level ordering detail that changes with every accepted message. If you need per-message sequence updates, read `client.getRemoteSnapshot()` in a `client.subscribeRemote()` callback. It returns a new array per accepted message, so use `client.getRemotePresence()` for rendering.

### useCursorStatus

```ts
function useCursorStatus(): ConnectionStatus;
```

Returns one of `"connecting"`, `"connected"`, `"reconnecting"`, `"disconnected"`.

### useCursorClient

```ts
function useCursorClient<TContext = unknown, TUser = unknown>(): PresenceClient<TContext, TUser> | null;
```

Returns the client instance passed to `LiveCursorProvider`, or `null` outside a provider or during SSR.

### useCursorContext

```ts
function useCursorContext<TContext = unknown>(): [
  TContext | undefined,
  (next: TContext | undefined) => void,
];
```

Returns the current context value and a setter. The initial value is the client's current context, including the `context` option passed to `createPresenceClient`. The setter calls `client.setContext()` and updates every subscribed component.

Caveat: a direct `client.setContext()` call outside the hook updates the client, but subscribed components rerender only on the next hook-driven update. Set context through the hook's setter.

```tsx
function SettingsDialog({ open }: { open: boolean }) {
  const [, setContext] = useCursorContext();
  useEffect(() => {
    setContext({ dialog: open ? "settings" : undefined });
  }, [open, setContext]);
  return open ? <DialogBody /> : null;
}
```

## CursorLayer and DefaultCursor

No cursor component is required (Invariant 9). `@anchor-presence/react` also exports `CursorLayer` and `DefaultCursor` as an optional, configurable cursor renderer.

### Minimal use

```tsx
import { CursorLayer } from "@anchor-presence/react";

function App() {
  return (
    <LiveCursorProvider client={client}>
      <Dashboard />
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

`CursorLayer` calls `useRemoteCursorsSelector` once, with a selector that keeps the visible, unfiltered cursors. It renders one fixed-position root for each selected cursor, and it renders `DefaultCursor` inside that root by default.

### Label and color mapping

```tsx
type MyContext = { pageId: string };
type MyUser = { name: string; color?: string };

<CursorLayer<MyContext, MyUser>
  getLabel={(cursor) => cursor.user?.name ?? "Guest"}
  getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
/>
```

Validate `cursor.user` values before you return them. Remote `user` data is untrusted; treat it as text, never as HTML. See `docs/security.md`.

### Filtering cursors

```tsx
<CursorLayer filterCursor={(cursor) => cursor.tier !== "viewport"} />
```

`filterCursor` runs after the visibility check. `CursorLayer` skips `getLabel` and `getColor` for a cursor that `filterCursor` removes.

### Root properties

```tsx
<CursorLayer
  getCursorProps={(cursor) => ({
    className: "my-cursor",
    "data-testid": "remote-cursor",
  })}
/>
```

`getCursorProps` can add classes, non-geometry styles, and attributes to the root. The package always sets `position`, `left`, `top`, `transform`, and `pointerEvents` after the consumer style, so a consumer value can never replace them. A consumer value can replace `zIndex` (package default `50`).

### Custom cursor content

```tsx
<CursorLayer
  renderCursor={({ cursor, label, color }) => (
    <MyCursorGlyph color={color}>
      <span>{label}</span>
    </MyCursorGlyph>
  )}
/>
```

`renderCursor` replaces only the root's contents. The package still owns the root's position, transform, pointer events, `aria-hidden`, and identity data attributes (`data-anchor-presence-cursor`, `data-anchor-presence-client-id`, `data-anchor-presence-tier`, `data-anchor-presence-anchor`).

### DefaultCursor styling

`DefaultCursor` has no Tailwind dependency and no external stylesheet. Three CSS variables control its visual:

```tsx
<CursorLayer
  renderCursor={({ cursor, label, color }) => (
    <DefaultCursor
      label={label}
      color={color}
      style={{ "--anchor-presence-cursor-size": "28px" }}
    />
  )}
/>
```

An explicit CSS variable on `style` takes precedence over the `color` prop.

## Custom interpolation

The library ships two interpolators: `noneInterpolator` (snap, no easing) and `linearInterpolator` (fixed-duration ease). Anything richer, such as a spring, is application code. Pass a custom factory through `bindingOptions.resolution.interpolatorFactory`.

Implement the `Interpolator` interface from `@anchor-presence/core`:

```ts
interface Interpolator {
  target(x: number, y: number, timestampMs: number): void;
  shift(dx: number, dy: number): void;
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
}
type InterpolatorFactory = () => Interpolator;
```

Follow these rules. The resolver calls your interpolator once per remote cursor.

- `target` sets a new destination. Do not reset velocity or other internal motion state here.
- `shift` moves the current position and the target by the same delta. Do not ease this move. The resolver calls `shift` for local-only changes, such as a scroll, where the anchor moved but no new network packet arrived.
- `sample` returns the position for one frame. Set `settled: true` once motion has finished. A `settled: true` value lets the scheduler stop its animation-frame loop. An interpolator that never reports `settled: true` keeps that loop running forever.

Here is a trimmed spring, using semi-implicit Euler integration. The full version lives in `apps/demo/src/cursors/interpolators.ts`.

```ts
function springInterpolator(stiffness = 170, damping = 26): Interpolator {
  let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, targetY = 0, lastMs = 0, settled = true;

  return {
    target(nx, ny, ms) {
      targetX = nx;
      targetY = ny;
      settled = false;
      lastMs = ms;
    },
    shift(dx, dy) {
      x += dx; y += dy; targetX += dx; targetY += dy;
    },
    sample(ms) {
      const dt = Math.min(ms - lastMs, 64) / 1000;
      lastMs = ms;
      const ax = -stiffness * (x - targetX) - damping * vx;
      const ay = -stiffness * (y - targetY) - damping * vy;
      vx += ax * dt; vy += ay * dt;
      x += vx * dt; y += vy * dt;
      if (Math.hypot(vx, vy) < 0.05 && Math.hypot(x - targetX, y - targetY) < 0.05) {
        x = targetX; y = targetY; settled = true;
      }
      return { x, y, settled };
    },
  };
}
```

Register your style with `bindingOptions`:

```tsx
<LiveCursorProvider client={client} bindingOptions={{ resolution: { interpolatorFactory: springInterpolator } }}>
  <App />
</LiveCursorProvider>
```

The provider reads `bindingOptions` once, at binding creation (see the note above). To switch interpolator styles at runtime, give the provider (or an ancestor) a `key` that changes with the style. A key change remounts the subtree and creates a fresh binding with the new factory:

```tsx
<LiveCursorProvider key={style} client={client} bindingOptions={{ resolution: { interpolatorFactory: registry[style] } }}>
  <App />
</LiveCursorProvider>
```

Cursor state lives on the server, not in the binding, so a remount does not lose or reset any remote cursor's position.

## SSR notes

No package accesses the DOM at module load time. Two supported patterns:

1. Create the client only in browser-only code (for example inside a `useEffect`), and pass `client={null}` until it exists.
2. Pass `client={null}` for the duration of server rendering, and swap in a real client after hydration.

Every hook has a server-safe snapshot: `useRemoteCursors` and `useCursorPresence` return `[]`, `useCursorStatus` returns `"disconnected"`, `useCursorClient` returns `null`, `useCursorContext` returns `[undefined, setContext]`. `renderToString` works for a tree using every hook with `client={null}`.

```tsx
<LiveCursorProvider client={null}>
  <Dashboard />
</LiveCursorProvider>
```

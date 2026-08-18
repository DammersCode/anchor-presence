# React Adapter

`@anchor-presence/react` provides a provider component and six hooks. It holds no engine state; it subscribes to `core` and `dom` stores with `useSyncExternalStore`.

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

`bindingOptions` configures the automatically created binding: `maxAnchors`, `visibilityPolicy`, `interpolatorFactory`, and more. See `packages/dom/src/binding.ts` for the full `DomBindingOptions` shape. The provider reads `bindingOptions` only once, at binding creation; later changes to the object do not recreate the binding.

Pass `client={null}` during server-side rendering. See "SSR" below.

## Hooks

| Hook | Returns |
|---|---|
| `useCursorAnchor(id)` | a ref callback that registers and unregisters the element |
| `useRemoteCursors()` | `ResolvedCursor[]` snapshot |
| `useCursorPresence()` | raw remote `CursorPresence[]` |
| `useCursorStatus()` | `ConnectionStatus` |
| `useCursorClient()` | the `PresenceClient` instance, or `null` |
| `useCursorContext()` | `[context, setContext]` |

### useCursorAnchor

```ts
function useCursorAnchor(id: string): (element: Element | null) => void;
```

Returns a stable ref callback. Attach it to any DOM element to register it as a semantic anchor under `id`. On element change, the hook unregisters the old element and registers the new one. On `id` change, it re-registers the current element under the new ID.

```tsx
function DashboardButton() {
  const anchorRef = useCursorAnchor("nav.dashboard");
  return <button ref={anchorRef}>Dashboard</button>;
}
```

### useCursorAnchor in a list row

Give each row a unique anchor ID built from its own data. This keeps every row addressable, even in a virtualized or paginated list.

```tsx
function OrderRow({ order }: { order: Order }) {
  const anchorRef = useCursorAnchor(`orders.row:${order.id}.actions`);
  return (
    <tr>
      <td>{order.customer}</td>
      <td ref={anchorRef}>
        <button onClick={() => onView(order.id)}>View</button>
      </td>
    </tr>
  );
}
```

### useRemoteCursors

```ts
function useRemoteCursors<TContext = unknown, TUser = unknown>(): ResolvedCursor<TContext, TUser>[];
```

Returns the current resolved-cursor snapshot: `{ clientId, x, y, visible, anchorId, tier, context?, user? }[]`. Values are receiver-viewport pixels. Position with `position: fixed`.

Cursor movement updates flow only to components that call this hook. The provider never rerenders the rest of the app tree per cursor frame.

### useCursorPresence

```ts
function useCursorPresence<TContext = unknown, TUser = unknown>(): CursorPresence<TContext, TUser>[];
```

Returns the raw remote presence list, before geometry resolution. Use this only when you need fields resolution does not carry, such as `pointer.type`. Use `useRemoteCursors` for rendering instead.

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
function useCursorContext<TContext = unknown, TUser = unknown>(): [
  TContext | undefined,
  (next: TContext | undefined) => void,
];
```

Returns the current context value and a setter. The setter calls `client.setContext()` and updates every subscribed component.

```tsx
function SettingsDialog({ open }: { open: boolean }) {
  const [, setContext] = useCursorContext();
  useEffect(() => {
    setContext({ dialog: open ? "settings" : undefined });
  }, [open, setContext]);
  return open ? <DialogBody /> : null;
}
```

## Custom rendering: cursor layer example

The library ships no required cursor component (Invariant 9). Render cursors with `useRemoteCursors`:

```tsx
function CursorLayer() {
  const cursors = useRemoteCursors<unknown, { name: string }>();
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {cursors
        .filter((cursor) => cursor.visible)
        .map((cursor) => (
          <div
            key={cursor.clientId}
            style={{
              position: "fixed",
              left: cursor.x,
              top: cursor.y,
              transform: "translate(-2px, -2px)",
            }}
          >
            <CursorGlyph />
            <span>{cursor.user?.name ?? "Anonymous"}</span>
          </div>
        ))}
    </div>
  );
}
```

Render `cursor.user` and `cursor.context` values as text, never as HTML. See `docs/security.md`.

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

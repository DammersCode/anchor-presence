# @anchor-presence/react

`@anchor-presence/react` is the React adapter for Anchor Presence. It gives you a provider component, a set of hooks, and two optional cursor components.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

## Install

```sh
bun add @anchor-presence/react @anchor-presence/dom @anchor-presence/core
```

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { LiveCursorProvider, useCursorAnchor, CursorLayer } from "@anchor-presence/react";

const client = createPresenceClient({ transport: myTransport });

function DashboardButton() {
  const anchorRef = useCursorAnchor("nav.dashboard");
  return <button ref={anchorRef}>Dashboard</button>;
}

function App() {
  return (
    <LiveCursorProvider client={client}>
      <DashboardButton />
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

## Boundary rule

React holds no cursor state of its own. It reads the `core` and `dom` stores with `useSyncExternalStore`. The package never touches the DOM at load time, so it is safe to import on a server.

## Main exports

| Hook or component | What it does |
|---|---|
| `LiveCursorProvider` | Provides a `PresenceClient` and its `DomBinding` to the component tree |
| `useCursorAnchor(id)` | Ref callback that registers an element as a semantic anchor |
| `usePresenceClient({ factory, key? })` | A stable `PresenceClient` per `key`, memoized for the page lifetime |
| `useRemoteUsers()` | One entry per remote client: `clientId`, `user`, and `session` |
| `useRemoteCursors()` | Resolved cursor snapshot for rendering |
| `useRemoteCursorsSelector(select, isEqual?)` | A derived value that rerenders only when it changes |
| `useCursorPresence()` | Raw remote presence snapshot |
| `useCursorStatus()` | Connection status |
| `useCursorClient()` | The underlying `PresenceClient` |
| `useCursorContext()` | `[context, setContext]` |
| `CursorLayer` | Optional component that renders every visible remote cursor |
| `DefaultCursor` | Optional neutral cursor visual, used by `CursorLayer` by default |

## Client lifecycle

Create the client with `usePresenceClient`. The hook memoizes the client for the page lifetime. It returns the same instance across renders and StrictMode remounts.

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider, usePresenceClient } from "@anchor-presence/react";

function App() {
  const client = usePresenceClient({
    factory: () => createPresenceClient({ transport: createWebSocketTransport({ room: "main" }) }),
  });
  return (
    <LiveCursorProvider client={client}>
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

`PresenceClient` is a one-way latch. `dispose()` is final. The hook never disposes the client on unmount. Call `dispose()` on an explicit user action, for example on logout. The call clears the `key` entry. A later render creates a new client through the factory.

The registry lives at module scope. Clients survive route changes and component remounts until the page unloads. Pass a different `key` for a second client, for example an admin overlay.

The hook does not call `transport.connect()`. Connect the transport inside the factory or before render.

## Who's online

`useRemoteUsers` lists every remote client. Use it for a presence bar.

```tsx
import { useRemoteUsers } from "@anchor-presence/react";

function OnlineBar() {
  const users = useRemoteUsers();
  return <span>{users.length} online</span>;
}
```

`user` is the `TUser` you passed to `createPresenceClient`. The library does not derive labels or colors from `clientId`. Validate `user` before you render it.

## CursorLayer

`CursorLayer` is optional. It renders every visible remote cursor. You can style it with the props `getLabel`, `getColor`, `filterCursor`, and `getCursorProps`. You can replace its contents entirely with `renderCursor`.

```tsx
<CursorLayer
  getLabel={(cursor) => cursor.user?.name ?? "Guest"}
  getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
  filterCursor={(cursor) => cursor.tier !== "viewport"}
  getCursorProps={(cursor) => ({ className: "my-cursor" })}
  renderCursor={({ cursor, label, color }) => <MyCursorGlyph color={color}>{label}</MyCursorGlyph>}
/>
```

`CursorLayer` owns the cursor position and size. A custom style or `renderCursor` cannot change them. Remote user data is untrusted. Validate `cursor.user` before you render it.

See [docs/react.md](../../docs/react.md) in the repository root for the full hook reference, custom interpolation, and more examples.

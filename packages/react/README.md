# @anchor-presence/react

`@anchor-presence/react` is the React adapter for Anchor Presence. It gives you a provider component, a set of hooks, and two optional cursor components.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

## Install

```sh
bun add @anchor-presence/react @anchor-presence/dom @anchor-presence/core
```

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { LiveCursorProvider, CursorLayer } from "@anchor-presence/react";

const client = createPresenceClient({ transport: myTransport });

function DashboardButton() {
  return <button data-anchor="nav.dashboard">Dashboard</button>;
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

`@anchor-presence/react` holds no cursor state of its own. It reads the `@anchor-presence/core` and `@anchor-presence/dom` stores with `useSyncExternalStore`. The package never touches the DOM at load time, so it is safe to import on a server.

## Main exports

| Hook or component                            | What it does                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `LiveCursorProvider`                         | Creates the client through `factory` or accepts one through `client`, and provides it with its `DomBinding` to the component tree |
| `useRemoteUsers()`                           | One entry per remote client: `clientId`, `user`, and `session`                                                                    |
| `useRemoteCursors()`                         | Resolved cursor snapshot for rendering                                                                                            |
| `useRemoteCursorsSelector(select, isEqual?)` | A derived value that rerenders only when it changes                                                                               |
| `useCursorPresence()`                        | Raw remote presence list, stable per client (without `sequence`)                                                                  |
| `useCursorStatus()`                          | Connection status                                                                                                                 |
| `useCursorClient()`                          | The underlying `PresenceClient`                                                                                                   |
| `useCursorContext()`                         | `[context, setContext]`                                                                                                           |
| `CursorLayer`                                | Optional component that renders every visible remote cursor                                                                       |
| `DefaultCursor`                              | Optional neutral cursor visual, used by `CursorLayer` by default                                                                  |

## Hooks and render cost

Every hook rerenders its component only when the value it returns changes. Pick the hook that matches the value you need.

| Hook                                         | Rerenders when                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `useRemoteCursors()`                         | the resolved-cursor snapshot changes (every cursor frame while cursors move)                         |
| `useRemoteCursorsSelector(select, isEqual?)` | only when the `select` output changes under `isEqual`                                                |
| `useRemoteUsers()`                           | only when the set of remote clients, or their `user` or `session`, changes                           |
| `useCursorPresence()`                        | only when a remote client's `cursor`, `context`, `user`, `pointer`, `session`, or membership changes |
| `useCursorStatus()`                          | only when the connection status changes                                                              |
| `useCursorContext()`                         | only when the local context value changes                                                            |

Two rules of thumb:

- An idle room costs nothing: no inbound messages, no rerenders.
- A message that only advances `sequence` does not rerender `useCursorPresence` consumers. `sequence` is a wire-level ordering field and is not part of the stable snapshot. If you need per-message sequence updates, read `client.getRemoteSnapshot()` inside a `client.subscribeRemote()` callback.

`useRemoteCursors` rerenders every frame while cursors move, by design. When your component needs less than the full snapshot, derive a smaller value with `useRemoteCursorsSelector`.

## Client lifecycle

Pass `LiveCursorProvider` a `factory`. The provider runs it once per mount, in an effect, and disposes the client it created on unmount. It runs the factory only in the browser, so server renders and React Strict Mode's double-invoke in development never create two clients. Until the effect has run, the provider renders its children with a `null` client, and every hook returns its server-safe value.

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider } from "@anchor-presence/react";

function App() {
  return (
    <LiveCursorProvider
      factory={() => {
        const transport = createWebSocketTransport({ path: "/?room=main" });
        return createPresenceClient({ transport });
      }}
    >
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

The client connects the transport by default. Pass `autoConnect: false` to `createPresenceClient` and call `transport.connect()` yourself when you need that control.

To bring your own client, pass the `client` prop instead. The provider then never disposes it. Call `dispose()` yourself, on an explicit user action such as logout. `PresenceClient` is a one-way latch: `dispose()` is final, and you create a new client instead of reusing it.

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
type MyContext = { pageId: string };
type MyUser = { name: string; color?: string };

<CursorLayer<MyContext, MyUser>
  getLabel={(cursor) => cursor.user?.name ?? "Guest"}
  getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
  filterCursor={(cursor) => cursor.tier !== "viewport"}
  getCursorProps={(cursor) => ({ className: "my-cursor" })}
  renderCursor={({ cursor, label, color }) => <MyCursorGlyph color={color}>{label}</MyCursorGlyph>}
/>;
```

`CursorLayer` owns the cursor position and size. A custom style or `renderCursor` cannot change them. Remote user data is untrusted. Validate `cursor.user` before you render it.

See the [React guide](https://anchor-presence.vercel.app/docs/react) for the full hook reference, custom interpolation, and more examples.

# @anchor-presence/react

`@anchor-presence/react` is the React adapter for Anchor Presence. It gives you a provider component, a set of hooks, and two optional cursor components.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

## Install

Install the adapter and the two packages that it uses:

```sh
bun add @anchor-presence/react @anchor-presence/dom @anchor-presence/core
```

This app creates the client in the provider `factory` and renders the remote cursors:

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider } from "@anchor-presence/react";

function DashboardButton() {
  return <button data-anchor="nav.dashboard">Dashboard</button>;
}

function App() {
  return (
    <LiveCursorProvider
      factory={() => {
        const transport = createWebSocketTransport({ path: "/?room=main" });
        return createPresenceClient({ transport });
      }}
    >
      <DashboardButton />
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

## Boundary rule

`@anchor-presence/react` holds no cursor state of its own. It reads the `@anchor-presence/core` and `@anchor-presence/dom` stores with `useSyncExternalStore`. The package never touches the DOM at load time, so it is safe to import on a server.

## Main exports

The package exports these hooks and components:

| Hook or component                            | What it does                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `LiveCursorProvider`                         | Creates the client through `factory` or accepts one through `client`, and provides it with its `DomBinding` to the component tree |
| `useRemoteUsers()`                           | One entry per peer (another client in the same room): `clientId`, `user`, `session`, and `idle`                                   |
| `useRemoteCursors()`                         | Resolved cursor snapshot for rendering                                                                                            |
| `useRemoteCursorsSelector(select, isEqual?)` | A derived value that rerenders only when it changes                                                                               |
| `useRemotePresence()`                        | Raw remote presence list, stable per peer (without `sequence`)                                                                    |
| `useCursorStatus()`                          | Connection status                                                                                                                 |
| `useCursorClient()`                          | The `PresenceClient` of the provider                                                                                              |
| `useCursorBinding()`                         | The `DomBinding` of the provider, for example to call `invalidate()`                                                              |
| `useLocalContext()`                          | `[context, setContext]`                                                                                                           |
| `useLocalUser()`                             | `[user, setUser]` for the local user value                                                                                        |
| `useCursorEvents(listener)`                  | Calls `listener` for each one-shot event from a peer                                                                              |
| `usePeerChanges(listener)`                   | Calls `listener` when a peer joins, leaves, or changes its `user` or `context`                                                    |
| `useSendEvent<TEvents>()`                    | A function that sends one-shot events of the event map `TEvents`                                                                  |
| `createPresenceHooks()`                      | Returns the provider and every hook with your context, user, and event types fixed                                                |
| `CursorLayer`                                | Optional component that renders every visible remote cursor                                                                       |
| `DefaultCursor`                              | Optional neutral cursor visual, used by `CursorLayer` by default                                                                  |

## Hooks and render cost

Every hook rerenders its component only when the value that it returns changes. Pick the hook that matches the value that you need.

| Hook                                         | Rerenders when                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `useRemoteCursors()`                         | the resolved-cursor snapshot changes (every cursor frame while cursors move)                             |
| `useRemoteCursorsSelector(select, isEqual?)` | only when the `select` output changes under `isEqual`                                                    |
| `useRemoteUsers()`                           | only when the set of peers, or the `user`, `session`, or `idle` field of one peer, changes               |
| `useRemotePresence()`                        | only when the `cursor`, `context`, `user`, `pointer`, `session`, `idle`, or membership of a peer changes |
| `useCursorStatus()`                          | only when the connection status changes                                                                  |
| `useLocalContext()`                          | only when the local context value changes                                                                |
| `useLocalUser()`                             | only when the local user value changes                                                                   |

Two more rules apply:

- An idle room costs nothing: no inbound messages, no rerenders.
- A message that only advances `sequence` does not rerender `useRemotePresence` consumers. `sequence` is a wire-level ordering field and is not part of the stable snapshot. To read each `sequence` value, call `client.getRemoteSnapshot()` inside a `client.subscribeRemote()` callback.

`useRemoteCursors` rerenders every frame while cursors move. If your component needs less than the full snapshot, derive a smaller value with `useRemoteCursorsSelector`.

## Client lifecycle

Pass `LiveCursorProvider` a `factory`. The provider runs it once per mount, in an effect, and disposes the client that it created on unmount. It runs the factory only in the browser, so a server render creates no client. In development, React Strict Mode mounts the provider twice. The provider then creates two clients in sequence and disposes the first, so one live client remains. Before the effect runs, the provider renders its children with a `null` client, and every hook returns its server-safe value.

The sample in [Install](#install) creates the client in the factory.

The client connects the transport by default. To connect at a time that you choose, pass `autoConnect: false` to `createPresenceClient` and call `transport.connect()` yourself.

To bring your own client, pass the `client` prop instead. The provider then never disposes it. Call `dispose()` yourself, on an explicit user action such as logout. After `dispose()`, you cannot use the client again. Create a new client instead.

## Who is online

`useRemoteUsers` lists every peer. This component shows the number of peers in a presence bar:

```tsx
import { useRemoteUsers } from "@anchor-presence/react";

function OnlineBar() {
  const users = useRemoteUsers();
  return <span>{users.length} online</span>;
}
```

`user` is the `TUser` that you passed to `createPresenceClient`. Without `getLabel`, `CursorLayer` shows `user.name` when it is a string that is not empty. Without `getColor`, it picks one color per `clientId` from a palette of 8 colors. Check `user` before you render it.

## CursorLayer

`CursorLayer` is optional. It renders every visible remote cursor. You can style it with the props `getLabel`, `getColor`, `filterCursor`, and `getCursorProps`. You can replace its contents with `renderCursor`. This sample uses every prop:

```tsx
type MyContext = { pageId: string };
type MyUser = { name: string; color?: string };
declare function MyCursorGlyph(props: { color: string; children: React.ReactNode }): React.JSX.Element;

<CursorLayer<MyContext, MyUser>
  getLabel={(cursor) => cursor.user?.name ?? "Guest"}
  getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
  filterCursor={(cursor) => cursor.tier !== "viewport"}
  getCursorProps={() => ({ className: "my-cursor" })}
  renderCursor={({ label, color }) => <MyCursorGlyph color={color}>{label}</MyCursorGlyph>}
  zIndex={1000}
/>;
```

`CursorLayer` owns the position, the opacity, and the pointer events of each cursor element. A custom style or `renderCursor` cannot change them.

> [!WARNING]
> If you render `cursor.user`, check it first. A peer sends this data, and it can hold any value.

See the [React guide](https://anchor-presence.vercel.app/docs/react) for the full hook reference and more examples. For cursor motion, see [Motion](https://anchor-presence.vercel.app/docs/dom/motion).

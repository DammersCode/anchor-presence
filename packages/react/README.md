# @anchor-presence/react

React is the framework adapter layer of Anchor Presence. It provides a provider component and six hooks. It depends on `@anchor-presence/core` and `@anchor-presence/dom`.

## Boundary rule

React holds no engine state of its own. It subscribes to `core` and `dom` stores with `useSyncExternalStore`. Every hook has a server-safe snapshot, so the package never accesses the DOM at module load time.

## Main exports

- `LiveCursorProvider` — provides a `PresenceClient` and its `DomBinding` to the component tree
- `useCursorAnchor(id)` — ref callback that registers and unregisters an element as a semantic anchor
- `useRemoteCursors()` — resolved cursor snapshot for rendering
- `useCursorPresence()` — raw remote presence snapshot
- `useCursorStatus()` — connection status
- `useCursorClient()` — the underlying `PresenceClient`
- `useCursorContext()` — `[context, setContext]`

## Usage

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { LiveCursorProvider, useCursorAnchor, useRemoteCursors } from "@anchor-presence/react";

const client = createPresenceClient({ transport: myTransport });

function DashboardButton() {
  const anchorRef = useCursorAnchor("nav.dashboard");
  return <button ref={anchorRef}>Dashboard</button>;
}

function CursorLayer() {
  const cursors = useRemoteCursors();
  return (
    <>
      {cursors.filter((c) => c.visible).map((c) => (
        <div key={c.clientId} style={{ position: "fixed", left: c.x, top: c.y }} />
      ))}
    </>
  );
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

See `docs/react.md` in the repository root for the full hook reference, SSR notes, and more examples.

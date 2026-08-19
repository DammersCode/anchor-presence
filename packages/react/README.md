# @anchor-presence/react

The framework adapter layer of Anchor Presence: a provider component, six hooks, and two optional cursor components.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

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

React holds no engine state of its own. It subscribes to `core` and `dom` stores with `useSyncExternalStore`. Every hook has a server-safe snapshot, so the package never accesses the DOM at module load time.

## Main exports

- `LiveCursorProvider` — provides a `PresenceClient` and its `DomBinding` to the component tree
- `useCursorAnchor(id)` — ref callback that registers and unregisters an element as a semantic anchor
- `useRemoteCursors()` — resolved cursor snapshot for rendering
- `useCursorPresence()` — raw remote presence snapshot
- `useCursorStatus()` — connection status
- `useCursorClient()` — the underlying `PresenceClient`
- `useCursorContext()` — `[context, setContext]`
- `CursorLayer` — optional component that renders every visible remote cursor
- `DefaultCursor` — optional neutral cursor visual, used by `CursorLayer` by default

## CursorLayer

No cursor component is required (Invariant 9). `CursorLayer` is an optional, configurable renderer built on `useRemoteCursors`.

```tsx
<CursorLayer
  getLabel={(cursor) => cursor.user?.name ?? "Guest"}
  getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
  filterCursor={(cursor) => cursor.tier !== "viewport"}
  getCursorProps={(cursor) => ({ className: "my-cursor" })}
  renderCursor={({ cursor, label, color }) => <MyCursorGlyph color={color}>{label}</MyCursorGlyph>}
/>
```

`CursorLayer` owns the root's position, transform, pointer events, `aria-hidden`, and identity data attributes. A consumer style or `renderCursor` cannot replace these geometry values. Validate `cursor.user` before you render it; remote user data is untrusted. See `docs/react.md` in the repository root for the full API and more examples.

## Install

```sh
bun add @anchor-presence/react @anchor-presence/dom @anchor-presence/core
```

See `docs/react.md` in the repository root for the full hook reference, SSR notes, custom interpolation, and more examples.

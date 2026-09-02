---
name: anchor-presence
description: Integrate anchor-presence live cursors into a React app — semantic anchors, presence client, transports, cursor rendering, visibility policies. Use when adding live cursors or multiplayer presence to a DOM app, wiring @anchor-presence packages, choosing anchor IDs, or when remote cursors drift, vanish, or point at the wrong element.
---

Anchor-presence shows remote user cursors in DOM apps without a canvas. A cursor is transmitted as a semantic **anchor** ID plus a normalized offset inside it, with a fallback **chain** and a viewport fallback. The receiver resolves everything against its own layout — the receiver is authoritative, so different window sizes, sidebar states, and responsive wrapping all show the cursor over the semantically same element.

Read [anchors.md](anchors.md) before choosing anchor IDs. Read [troubleshooting.md](troubleshooting.md) when a cursor drifts, vanishes, or lands on the wrong element.

## Integration steps

1. Install the packages with the project's package manager:

```bash
npm install @anchor-presence/core @anchor-presence/dom @anchor-presence/react
```

2. Create a transport and a client in browser-only code. Any bidirectional byte channel works — the interface is five methods (`send`, `subscribe`, optional `connect`/`disconnect`/`subscribeStatus`). A WebSocket relay that broadcasts each message to the other sockets in a room is a complete server.

```ts
import { createPresenceClient } from "@anchor-presence/core";

const client = createPresenceClient({
  transport: myTransport,
  user: { name: currentUserName, color: pickFromKnownPalette(currentUserName) },
});
```

`clientId` identifies a browser tab, never a user. Put user identity in `user`. Two tabs sharing a `clientId` produce visible cursor flapping.

3. Wrap the app once:

```tsx
<LiveCursorProvider client={client}>
  <App />
  <CursorLayer />
</LiveCursorProvider>
```

`<CursorLayer />` alone renders a neutral cursor. Configure visuals through its props — `getLabel`, `getColor`, `filterCursor`, `getCursorProps`, or replace the contents entirely with `renderCursor`. The package owns positioning; a custom renderer only fills the positioned root.

4. Mark an **anchor** on every element users point at meaningfully with the binding's anchor attribute. The default attribute is `data-anchor`; the binding watches it automatically.

```tsx
<button data-anchor="orders.row:3.actions.delete">Delete</button>
```

Mark the parents too (`orders.row:3`, `orders`) — the **chain** degrades to them when the exact anchor is absent on a receiver.

5. Publish UI state as context, and hide cursors that stop making sense with a **policy**:

```tsx
const [, setContext] = useCursorContext();
setContext({ page: currentPage });
// bindingOptions on the provider:
const policy = ({ presence, resolution }) =>
  presence.context?.page !== localPage || resolution.tier === "hidden" ? "hide" : "show";
```

The policy also receives `resolution.pointVisible` — false when the resolved point is clipped by a scroll container — so apps can hide cursors that would float over empty space.

**Done when**: two browser windows at different sizes, pointing at the same anchored element, each show the other's cursor over that element — and collapsing a sidebar or wrapping a flex row in one window keeps its cursor attached.

## Hard rules

- Render `user` and `context` values as text nodes; they arrive from the network untrusted. Map colors through a known palette instead of applying arbitrary strings as CSS.
- Create the client in browser-only code; every hook has a server-safe snapshot, so SSR renders work with `client={null}`.
- Anchor IDs are opaque map keys on the receiver — they never run as selectors, so any stable string is safe.

## Source

Docs, transports (Socket.IO, SignalR, BroadcastChannel), and examples: https://github.com/DammersCode/anchor-presence

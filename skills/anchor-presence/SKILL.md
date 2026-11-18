---
name: anchor-presence
description: Adds anchor-presence live cursors to a React app, or fixes them. Use when adding live, shared, multiplayer, or Figma-style cursors, real-time presence, or a who-is-online list; wiring @anchor-presence packages or a relay; choosing anchor IDs; or when remote cursors drift, vanish, or land on the wrong element.
compatibility: Requires React 18+ and a browser app; a relay needs Bun, Node, or an existing real-time server.
---

Anchor-presence shows remote cursors in DOM apps. A cursor travels as a semantic **anchor** ID plus a normalized offset inside that element, with a fallback **chain** of parent anchors and a viewport position. The **receiver** is authoritative: it resolves the anchor against its own layout, so the cursor lands on the same element at any window size, sidebar state, or responsive wrap.

Sources of truth, in order:

- After install: `node_modules/@anchor-presence/{core,dom,react}/README.md` and the package `.d.ts` files. Trust them over any sample here.
- Docs as markdown: `https://anchor-presence.vercel.app/docs/<page>.md`, index at `https://anchor-presence.vercel.app/llms.txt`.

To fix a broken integration, go straight to [troubleshooting.md](troubleshooting.md). To score cursor-jump risk across layouts, use the `anchor-presence-audit` skill.

## Integration steps

### 1. Survey the project

Read the code and record:

- package manager and React version (18 or later required);
- framework and rendering: Vite SPA, Next.js App Router, Remix, or other; whether components render on the server;
- existing real-time channel: Socket.IO, SignalR, a WebSocket server, a managed service, or none;
- where the current user's display name comes from;
- which views get live cursors.

**Done when** every item has an answer. Ask the user only for items the code cannot answer, usually the target views and, when no real-time channel exists, where a **relay** may run.

### 2. Choose the transport and relay

Read [transports.md](transports.md) and pick the row that matches the survey.

**Done when** the transport, the relay location, and the room key are decided.

### 3. Install

```bash
npm install @anchor-presence/core @anchor-presence/dom @anchor-presence/react
```

Use the project's package manager. Install the relay dependencies from the chosen row too.

### 4. Create the client and render the cursor layer

Create the client in the provider's `factory`, in a client component. The factory creates the transport and returns the client; the client connects by default:

```tsx
"use client";
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider } from "@anchor-presence/react";

export function PresenceRoot({
  room,
  userName,
  children,
}: {
  room: string;
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <LiveCursorProvider<unknown, { name: string }>
      factory={() => {
        const transport = createWebSocketTransport({
          url: `wss://relay.example.com/?room=${encodeURIComponent(room)}`,
        });
        return createPresenceClient({ transport, user: { name: userName } });
      }}
    >
      {children}
      <CursorLayer<unknown, { name: string }> getLabel={(cursor) => cursor.user?.name ?? null} />
    </LiveCursorProvider>
  );
}
```

- The `factory` never runs on the server or before the mount effect; until then the provider renders its children with a `null` client. This keeps SSR and React Strict Mode safe. The provider disposes the client it created on unmount.
- A client identifies one browser tab. User identity goes in `user`.
- `CursorLayer` owns positioning. Customize it with `getLabel`, `getColor`, `filterCursor`, `getCursorProps`, or `renderCursor`.

**Done when** the provider wraps every target view and the project typechecks.

### 5. Mark anchors

Read [anchors.md](anchors.md), then add `data-anchor` to the elements users point at.

**Done when** every navigation item, card, table row, row action, dialog, and primary control in the target views has an anchor, and every specific anchor has a marked parent.

### 6. Scope cursors with context and a policy

This step applies when one anchor ID can appear in different app states (pages, tabs, open dialogs). Publish the state as **context** and hide cursors from other states with a visibility **policy**:

```tsx
function PresenceScope({
  client,
  currentPage,
  children,
}: {
  client: PresenceClient<{ page: string }> | null;
  currentPage: string;
  children: React.ReactNode;
}) {
  // The provider reads bindingOptions once, so the policy reads the page through a ref.
  const pageRef = useRef(currentPage);
  useEffect(() => {
    pageRef.current = currentPage;
  }, [currentPage]);

  return (
    <LiveCursorProvider<{ page: string }>
      client={client}
      bindingOptions={{
        resolution: {
          visibilityPolicy: ({ presence, resolution }) =>
            presence.context?.page !== pageRef.current || resolution.tier === "hidden" ? "hide" : "show",
        },
      }}
    >
      <PublishPage page={currentPage} />
      {children}
    </LiveCursorProvider>
  );
}

// useLocalContext works only below the provider.
function PublishPage({ page }: { page: string }) {
  const [, setContext] = useLocalContext<{ page: string }>();
  useEffect(() => setContext({ page }), [page, setContext]);
  return null;
}
```

### 7. Add a presence list

This step applies when the user asked for a who-is-online list. `useRemoteUsers()` returns one entry per remote tab with `clientId`, `user`, `session`, and `idle`. Render `user.name` as text.

### 8. Verify with two clients

Run the project's typecheck and build. Then run two clients in the same room with different viewport widths, for example two Playwright browser contexts at 1440 px and 900 px. Move the pointer over an anchored element in the wide one.

**Done when** the narrow client shows an element matching `[data-anchor-presence-anchor="<that anchor ID>"]`, positioned over the same element. When no browser automation exists, give the user these steps to run by hand.

## Hard rules

- Render `user` and `context` values as text nodes: they arrive from the network untrusted. Map colors through a fixed palette.
- Create clients and transports only in browser code, through the provider's `factory`.
- A custom cursor element gets `position: fixed`, `pointer-events: none`, and `aria-hidden="true"`. Render it at the app root, outside any ancestor with `transform`, `filter`, or `contain`.
- Treat anchor IDs as opaque keys: the receiver looks them up in a map and never runs them as selectors.
- Every client in a room uses the same codec. The default is `jsonCodec`.

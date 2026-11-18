import { useCallback, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { CursorLayer } from "../src/cursor";
import { useRemoteCursorsSelector } from "../src/hooks/use-remote-cursors";

// type-level proof that createWebSocketTransport has connect and disconnect
const ws = createWebSocketTransport({ url: "ws://x" });
void ws.connect;
void ws.disconnect;

// a provider tree on an in-memory transport, so the render needs no network
const { a: transport } = createInMemoryPair();
const client = createPresenceClient({ transport, user: { name: "Alice" } });

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

// packages/react/README.md CursorLayer sample, verbatim aside from the type annotation
type MyUser = { name: string; color?: string };
type MyContext = { pageId: string };

function CursorLayerSample() {
  return (
    <CursorLayer<MyContext, MyUser>
      getLabel={(cursor: ResolvedCursor<MyContext, MyUser>) => cursor.user?.name ?? "Guest"}
      getColor={(cursor: ResolvedCursor<MyContext, MyUser>) => cursor.user?.color ?? "#6b7280"}
      filterCursor={(cursor: ResolvedCursor<MyContext, MyUser>) => cursor.tier !== "viewport"}
      getCursorProps={() => ({ className: "my-cursor" })}
      zIndex={1000}
    />
  );
}

// react/client-creation.mdx: Your own client, verbatim
function OwnClientApp() {
  // oxlint-disable-next-line eslint/no-shadow -- the sample copies the docs text
  const [client, setClient] = useState<PresenceClient | null>(null);
  useEffect(() => {
    const created = createPresenceClient({ transport: createWebSocketTransport({ path: "/?room=main" }) });
    // oxlint-disable-next-line react/set-state-in-effect -- the sample copies the docs text
    setClient(created);
    return () => created.dispose();
  }, []);
  return (
    <LiveCursorProvider client={client}>
      <CursorLayer />
    </LiveCursorProvider>
  );
}

// react/rerenders.mdx: Usage, verbatim
function TierBadge({ clientId }: { clientId: string }) {
  const select = useCallback(
    (cursors: ResolvedCursor[]) => cursors.find((cursor) => cursor.clientId === clientId)?.tier ?? "hidden",
    [clientId],
  );
  const tier = useRemoteCursorsSelector(select);
  return <span>{tier}</span>;
}

describe("doc samples compile and render", () => {
  it("renders the own-client sample on the server without a client", () => {
    expect(renderToString(<OwnClientApp />)).toBe("");
  });

  it("renders the TierBadge sample as hidden without cursors", () => {
    const html = renderToString(
      <LiveCursorProvider client={null}>
        <TierBadge clientId="peer" />
      </LiveCursorProvider>,
    );
    expect(html).toContain("hidden");
  });

  it("renders a provider tree on an in-memory transport", () => {
    const html = renderToString(<App />);
    expect(html).toContain("data-anchor");
  });

  it("renders the CursorLayer sample from packages/react/README.md", () => {
    const html = renderToString(
      <LiveCursorProvider client={null}>
        <CursorLayerSample />
      </LiveCursorProvider>,
    );
    expect(html).not.toBeNull();
  });
});

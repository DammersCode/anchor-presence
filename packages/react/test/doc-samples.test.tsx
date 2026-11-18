import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { CursorLayer } from "../src/cursor";

// type-level proof that createWebSocketTransport's connect/disconnect are no longer optional (README quick start)
const ws = createWebSocketTransport({ url: "ws://x" });
void ws.connect;
void ws.disconnect;

// README quick start, rendered with an in-memory transport so the sample needs no network
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

describe("doc samples compile and render", () => {
  it("renders the README quick start", () => {
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

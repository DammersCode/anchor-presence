import { useCallback, useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { CursorLayer } from "../src/cursor";
import { useRemoteCursorsSelector } from "../src/hooks/use-remote-cursors";
import { docSample, missingSamples } from "./doc-source";

// type-level proof that createWebSocketTransport has connect and disconnect
const ws = createWebSocketTransport({ url: "ws://x" });
void ws.connect;
void ws.disconnect;

// packages/react/README.md install sample, verbatim
function DashboardButton() {
  return <button data-anchor="nav.dashboard">Dashboard</button>;
}

function App() {
  return (
    <LiveCursorProvider
      factory={() => {
        const transport = createWebSocketTransport({ port: 8788, path: "/?room=main" });
        return createPresenceClient({ transport });
      }}
    >
      <DashboardButton />
      <CursorLayer />
    </LiveCursorProvider>
  );
}

// packages/react/README.md CursorLayer sample; the README declares MyCursorGlyph, the test defines it
type MyContext = { pageId: string };
type MyUser = { name: string; color?: string };
function MyCursorGlyph(props: { color: string; children: React.ReactNode }): React.JSX.Element {
  return <span style={{ color: props.color }}>{props.children}</span>;
}

const safeColor = (color?: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : "#6b7280";

function CursorLayerSample() {
  return (
    <CursorLayer<MyContext, MyUser>
      getLabel={(cursor) => cursor.user?.name ?? "Guest"}
      getColor={(cursor) => safeColor(cursor.user?.color)}
      filterCursor={(cursor) => cursor.tier !== "viewport"}
      getCursorProps={() => ({ className: "my-cursor" })}
      renderCursor={({ label, color }) => <MyCursorGlyph color={color}>{label}</MyCursorGlyph>}
      zIndex={1000}
    />
  );
}

// react/client-creation.mdx: Your own client, verbatim
function OwnClientApp() {
  const [client, setClient] = useState<PresenceClient | null>(null);
  useEffect(() => {
    const created = createPresenceClient({
      transport: createWebSocketTransport({ port: 8788, path: "/?room=main" }),
    });
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

  it("renders the README install sample on the server without a client", () => {
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

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    expect(
      missingSamples("doc-samples.test.tsx", [
        docSample("react/client-creation.mdx", "function OwnClientApp"),
        docSample("react/rerenders.mdx", "function TierBadge"),
      ]),
    ).toEqual([]);
  });
});

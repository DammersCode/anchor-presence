import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createPresenceClient } from "@anchor-presence/core";
import { createBroadcastChannelTransport, createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, PresenceProvider } from "../src/index";

// Verbatim copies of the quick start and deploy-relay samples; the last test checks each copy against its source.

function createClient() {
  const transport = createBroadcastChannelTransport("live-cursors");
  return createPresenceClient({ transport, user: { name: `Guest ${Math.floor(Math.random() * 100)}` } });
}

export function App() {
  return (
    <PresenceProvider factory={createClient}>
      <button data-anchor="nav.dashboard">Dashboard</button>
      <CursorLayer />
    </PresenceProvider>
  );
}

function relayVariant() {
  // oxlint-disable-next-line eslint/no-shadow -- the copy keeps the name of the doc sample
  function createClient() {
    const transport = createWebSocketTransport({ port: 8788, path: "/?room=main" });
    return createPresenceClient({ transport, user: { name: `Guest ${Math.floor(Math.random() * 100)}` } });
  }
  return createClient;
}

function readmeRelayLine() {
  const transport = createWebSocketTransport({ port: 8788, path: "/?room=main" });
  return transport;
}

function deployRelayTransport() {
  const transport = createWebSocketTransport({
    url: "wss://relay.example.com/?room=main",
    token: async () => (await fetch("/api/room-token")).text(),
  });
  return transport;
}

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

// Returns the ts or tsx block of `file` that contains `marker`, without import lines.
function sampleIn(file: string, marker: string): string {
  const blocks = [...readRepoFile(file).matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${file}`);
  return block;
}

describe("quick start samples", () => {
  it("render on the server without a client", () => {
    expect(renderToString(<App />)).toContain('data-anchor="nav.dashboard"');
  });

  it("mount in the browser and dispose the client on unmount", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<App />));
    expect(container.querySelector("[data-anchor]")).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("build a relay client factory", () => {
    expect(relayVariant()).toBeTypeOf("function");
    expect(readmeRelayLine).toBeTypeOf("function");
    expect(deployRelayTransport).toBeTypeOf("function");
  });

  it("match the docs and the README", () => {
    const source = trimLines(readRepoFile("packages/react/test/docs-quick-start.test.tsx"))
      .split("\n")
      .filter((line) => !line.includes("oxlint-disable"))
      .join("\n");
    const quickStart = "apps/docs/content/docs/get-started/quick-start.mdx";
    const samples = [
      sampleIn(quickStart, 'createBroadcastChannelTransport("live-cursors")'),
      sampleIn(quickStart, "createWebSocketTransport({ port: 8788"),
      sampleIn("README.md", 'createBroadcastChannelTransport("live-cursors")'),
      sampleIn("README.md", "createWebSocketTransport({ port: 8788"),
      sampleIn("apps/docs/content/docs/get-started/guides/deploy-relay.mdx", "wss://relay.example.com"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});

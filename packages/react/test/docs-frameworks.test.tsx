import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Outlet as RrOutlet } from "react-router";
import { describe, expect, it } from "vitest";
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider } from "../src/index";

// Verbatim copies of the samples in frameworks.mdx; the last test checks each copy against its source.

// presence-provider.tsx

function createClient() {
  const transport = createWebSocketTransport({ port: 8788, path: "/?room=main" });
  return createPresenceClient({ transport, user: { name: `Guest ${Math.floor(Math.random() * 100)}` } });
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  return (
    <LiveCursorProvider factory={createClient}>
      {children}
      <CursorLayer />
    </LiveCursorProvider>
  );
}

// app/layout.tsx

function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PresenceProvider>{children}</PresenceProvider>
      </body>
    </html>
  );
}

// src/routes/__root.tsx

const Route = createRootRoute({
  component: () => (
    <PresenceProvider>
      <Outlet />
    </PresenceProvider>
  ),
});

// oxlint-disable-next-line eslint/no-shadow -- the copy keeps the name of the doc sample
function reactRouterRoot(Outlet: typeof RrOutlet) {
  // app/root.tsx
  function App() {
    return (
      <PresenceProvider>
        <Outlet />
      </PresenceProvider>
    );
  }
  return App;
}

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.includes("oxlint-disable"))
    .join("\n");

// Returns the tsx block of frameworks.mdx that contains `marker`, without imports, directives and `export`.
function sample(marker: string): string {
  const markdown = readRepoFile("apps/docs/content/docs/get-started/frameworks.mdx");
  const blocks = [...markdown.matchAll(/```tsx\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import ") && line !== '"use client";')
      .join("\n")
      .replaceAll("export default function", "function")
      .replace(/^export const Route/mu, "const Route")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in frameworks.mdx`);
  return block;
}

describe("frameworks.mdx samples", () => {
  it("render on the server without a client", () => {
    const html = renderToString(<RootLayout>page</RootLayout>);
    expect(html).toContain("page");
    const App = reactRouterRoot(RrOutlet);
    expect(App).toBeTypeOf("function");
    expect(Route.options.component).toBeTypeOf("function");
  });

  it("match the docs", () => {
    const source = trimLines(readRepoFile("packages/react/test/docs-frameworks.test.tsx"));
    for (const marker of [
      "function PresenceProvider",
      "function RootLayout",
      "createRootRoute({",
      "function App",
    ]) {
      expect(source).toContain(trimLines(sample(marker)));
    }
  });
});

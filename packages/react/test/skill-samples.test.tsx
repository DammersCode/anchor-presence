import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createPresenceClient } from "@dammers/anchor-presence-core";
import { createWebSocketTransport } from "@dammers/anchor-presence-dom";
import { CursorLayer, PresenceProvider, useDomBinding, useLocalContext } from "../src/index";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

// Verbatim copies of the tsx samples in skills/anchor-presence/SKILL.md; the test below keeps them in sync.

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
    <PresenceProvider
      clientKey={room}
      factory={() => {
        const transport = createWebSocketTransport({
          url: `wss://relay.example.com/?room=${encodeURIComponent(room)}`,
        });
        return createPresenceClient({ transport, user: { name: userName } });
      }}
    >
      {children}
      <CursorLayer />
    </PresenceProvider>
  );
}

function parseContext(value: unknown): { page: string } | undefined {
  const page = typeof value === "object" && value !== null && "page" in value ? value.page : undefined;
  return typeof page === "string" ? { page } : undefined;
}

function ScopedPresenceRoot({
  room,
  userName,
  currentPage,
  children,
}: {
  room: string;
  userName: string;
  currentPage: string;
  children: React.ReactNode;
}) {
  // The provider reads bindingOptions once, so the policy reads the page through a ref.
  const pageRef = useRef(currentPage);

  return (
    <PresenceProvider
      clientKey={room}
      factory={() => {
        const transport = createWebSocketTransport({
          url: `wss://relay.example.com/?room=${encodeURIComponent(room)}`,
        });
        return createPresenceClient({ transport, user: { name: userName } });
      }}
      bindingOptions={{
        resolution: {
          visibilityPolicy: ({ presence, resolution }) =>
            parseContext(presence.context)?.page !== pageRef.current || resolution.tier === "hidden"
              ? "hide"
              : "show",
        },
      }}
    >
      <PublishPage page={currentPage} pageRef={pageRef} />
      {children}
      <CursorLayer />
    </PresenceProvider>
  );
}

// useLocalContext and useDomBinding work only below the provider.
function PublishPage({ page, pageRef }: { page: string; pageRef: { current: string } }) {
  const [, setContext] = useLocalContext();
  const binding = useDomBinding();
  useEffect(() => setContext({ page }), [page, setContext]);
  useEffect(() => {
    pageRef.current = page;
    binding?.invalidate("page-changed");
  }, [page, pageRef, binding]);
  return null;
}

// jsdom's URL global cannot resolve import.meta.url reliably, so paths start at the repo root.
const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

function sampleBodies(markdown: string): string[] {
  return [...markdown.matchAll(/```tsx\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .replaceAll(/^import[^;]*?from\s+"[^"]+";\n/gmu, "")
      .split("\n")
      .filter((line) => !line.startsWith("import ") && line !== '"use client";')
      .join("\n")
      .trim(),
  );
}

describe("skills/anchor-presence/SKILL.md samples", () => {
  it("match the type-checked copies in this file", () => {
    const source = readRepoFile("packages/react/test/skill-samples.test.tsx");
    const samples = sampleBodies(readRepoFile("skills/anchor-presence/SKILL.md"));
    expect(samples).toHaveLength(2);
    const [rootSample = "", scopedSample = ""] = samples;
    expect(source).toContain(rootSample);
    // The test file renames the step 6 copy, because step 4 already declares PresenceRoot.
    expect(source).toContain(
      scopedSample.replace("export function PresenceRoot(", "function ScopedPresenceRoot("),
    );
    expect(ScopedPresenceRoot).toBeTypeOf("function");
  });

  it("step 6: PublishPage invalidates the binding after it updates the page ref", () => {
    const { client } = makeFakeClient();
    const { binding } = makeFakeBinding();
    const pageRef = { current: "home" };
    const pagesAtInvalidate: string[] = [];
    binding.invalidate = () => pagesAtInvalidate.push(pageRef.current);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (page: string) =>
      act(() =>
        root.render(
          <PresenceProvider client={client} binding={binding}>
            <PublishPage page={page} pageRef={pageRef} />
          </PresenceProvider>,
        ),
      );

    render("home");
    render("settings");
    expect(pagesAtInvalidate.at(-1)).toBe("settings");
    expect(pagesAtInvalidate).toContain("home");
    act(() => root.unmount());
    container.remove();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import { createPresenceClient, type PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider, useCursorContext, usePresenceClient } from "../src/index";

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
  const client = usePresenceClient({
    factory: () => {
      const transport = createWebSocketTransport({
        url: `wss://relay.example.com/?room=${encodeURIComponent(room)}`,
      });
      return createPresenceClient({ transport, user: { name: userName }, autoConnect: true });
    },
  });

  return (
    <LiveCursorProvider client={client}>
      {children}
      <CursorLayer<unknown, { name: string }> getLabel={(cursor) => cursor.user?.name ?? null} />
    </LiveCursorProvider>
  );
}

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

// useCursorContext works only below the provider.
function PublishPage({ page }: { page: string }) {
  const [, setContext] = useCursorContext<{ page: string }>();
  useEffect(() => setContext({ page }), [page, setContext]);
  return null;
}

// jsdom's URL global cannot resolve import.meta.url reliably, so paths start at the repo root.
const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

function sampleBodies(markdown: string): string[] {
  return [...markdown.matchAll(/```tsx\n([\s\S]*?)```/g)].map(([, body = ""]) =>
    body
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
    for (const sample of samples) expect(source).toContain(sample);
    expect(PresenceScope).toBeTypeOf("function");
  });
});

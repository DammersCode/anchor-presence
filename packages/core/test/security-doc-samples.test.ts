import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";

const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

describe("security guide samples", () => {
  it("keeps only an https avatar and drops a user without a name", () => {
    const { a: transport, b: peer } = createInMemoryPair();
    // Verbatim copy of the parseUser sample in security.mdx; the next test checks it.
    const client = createPresenceClient<unknown, { name: string; avatar?: string }>({
      transport,
      parseUser: (value) => {
        const { name, avatar } = value as { name?: unknown; avatar?: unknown };
        if (typeof name !== "string") return undefined;
        const safeAvatar = typeof avatar === "string" && avatar.startsWith("https://") ? avatar : undefined;
        return safeAvatar === undefined ? { name } : { name, avatar: safeAvatar };
      },
    });
    const send = (clientId: string, user: unknown) =>
      peer.send(
        new TextEncoder().encode(
          JSON.stringify({ version: 1, clientId, session: "s", sequence: 0, cursor: null, user }),
        ),
      );
    void send("https", { name: "Ada", avatar: "https://x.test/a.png" });
    void send("script", { name: "Bob", avatar: "javascript:alert(1)" });
    void send("nameless", { avatar: "https://x.test/a.png" });
    const users = Object.fromEntries(client.getRemotePresence().map((p) => [p.clientId, p.user]));
    expect(users).toEqual({
      https: { name: "Ada", avatar: "https://x.test/a.png" },
      script: { name: "Bob" },
      nameless: undefined,
    });
    client.dispose();
  });

  it("matches the sample in security.mdx", () => {
    const page = readFileSync(
      join(import.meta.dirname, "../../../apps/docs/content/docs/get-started/guides/security.mdx"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const sample = page.match(/```ts\n([^`]*const safeAvatar[^`]*)```/u)?.[1];
    const source = readFileSync(import.meta.filename, "utf8").replaceAll("\r\n", "\n");
    expect(sample).toBeDefined();
    expect(trimLines(source)).toContain(trimLines(sample!.trim()));
  });
});

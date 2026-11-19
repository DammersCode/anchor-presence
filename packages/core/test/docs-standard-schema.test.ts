import * as v from "valibot";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createInMemoryPair, createPresenceClient } from "../src";
import { eventParserFrom, parserFrom } from "../src/standard-schema";
import { docSample, readRepoFile, trimLines } from "../../react/test/doc-source";

const transport = createInMemoryPair().a;

// Verbatim copies of the samples in core/standard-schema.mdx; the last test checks each copy against the page.

describe("standard-schema.mdx: check the user and the context", () => {
  it("types the remote user and context from the schemas", () => {
    const User = v.object({ name: v.string(), color: v.string() });
    const Context = v.object({ typingIn: v.nullable(v.string()) });

    const client = createPresenceClient({
      transport,
      user: { name: "Ada", color: "#4f46e5" },
      parseUser: parserFrom(User),
      parseContext: parserFrom(Context),
    });

    expectTypeOf(client.getRemotePresence()[0]?.user).toEqualTypeOf<
      { name: string; color: string } | null | undefined
    >();
    client.dispose();
  });
});

describe("standard-schema.mdx: types without a schema", () => {
  it("types the remote user as unknown", () => {
    const client = createPresenceClient({ transport, user: { name: "Ada" } });
    const remote = client.getRemotePresence()[0];
    const user: unknown = remote?.user;

    expectTypeOf(remote?.user).toEqualTypeOf<unknown>();
    expect(user).toBeUndefined();
    client.dispose();
  });
});

describe("standard-schema.mdx: check the events", () => {
  it("types the delivered events from the schemas", () => {
    const parseEvent = eventParserFrom({
      chat: z.object({ text: z.string().max(200) }),
      wave: null,
    });

    const client = createPresenceClient({ transport, parseEvent });

    expect(parseEvent({ clientId: "p", type: "chat", data: { text: "x".repeat(201) } })).toBeUndefined();
    client.dispose();
  });
});

describe("standard-schema.mdx: see why a value was dropped", () => {
  it("reports the issues of a rejected user", () => {
    const User = v.object({ name: v.string(), color: v.string() });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const parseUser = parserFrom(User, {
      onInvalid: (issues) => console.warn("dropped a user", issues[0]?.message),
    });

    expect(parseUser({ name: 1 })).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("standard-schema.mdx samples", () => {
  it("match the page", () => {
    const source = trimLines(readRepoFile("packages/core/test/docs-standard-schema.test.ts"));
    const samples = [
      docSample("core/standard-schema.mdx", "const User = v.object"),
      docSample("core/standard-schema.mdx", "const remote = client"),
      docSample("core/standard-schema.mdx", "const parseEvent = eventParserFrom"),
      docSample("core/standard-schema.mdx", "const parseUser = parserFrom"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});

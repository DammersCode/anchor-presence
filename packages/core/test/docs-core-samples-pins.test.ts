import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient, jsonCodec as exportedJsonCodec } from "../src";
import type { PresenceCodec } from "../src";
import { docSample, readRepoFile, trimLines } from "../../react/test/doc-source";

const myTransport = createInMemoryPair().a;

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

describe("presence-client.mdx: adaptive publish", () => {
  it("creates a client with a high watermark", () => {
    const client = createPresenceClient({
      transport: myTransport,
      adaptivePublish: { highWatermarkBytes: 64 * 1024 },
    });
    client.dispose();
    expect(client.getStatus()).toBeTypeOf("string");
  });
});

describe("codecs.mdx: jsonCodec", () => {
  it("works like the exported jsonCodec", () => {
    const jsonCodec: PresenceCodec = {
      encode(message) {
        return new TextEncoder().encode(JSON.stringify(message));
      },
      decode(data) {
        try {
          return JSON.parse(new TextDecoder().decode(data));
        } catch {
          return null;
        }
      },
    };

    const bytes = new TextEncoder().encode("not json");
    expect(jsonCodec.decode(bytes)).toBeNull();
    expect(exportedJsonCodec.decode(bytes)).toBeNull();
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/core/test/docs-core-samples-pins.test.ts"));
    const samples = [
      docSample("core/presence-client.mdx", "adaptivePublish: { highWatermarkBytes"),
      docSample("core/codecs.mdx", "const jsonCodec: PresenceCodec"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});

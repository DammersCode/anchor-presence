import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient, jsonCodec } from "../src/index";
import { fileSample, trimLines, readRepoFile } from "../../react/test/doc-source";

describe("core README sample", () => {
  it("creates a client that publishes a cursor and reports remote changes", () => {
    const { a: myTransport, b } = createInMemoryPair();
    const listener = createPresenceClient({ transport: b });
    const seen: number[] = [];
    listener.subscribeRemote(() => seen.push(listener.getRemoteSnapshot().length));

    const client = createPresenceClient({
      transport: myTransport,
      codec: jsonCodec, // default; pass a custom PresenceCodec for a different wire format
      publishIntervalMs: 50,
    });

    client.setLocalCursor({ anchors: [{ id: "nav.dashboard", u: 0.5, v: 0.5 }] });
    client.subscribeRemote(() => {
      console.log(client.getRemoteSnapshot());
    });
    expect(client.getRemoteSnapshot()).toEqual([]);
    client.dispose();
    listener.dispose();
  });

  it("matches the README", () => {
    const sample = fileSample("packages/core/README.md", "const client = createPresenceClient");
    const source = trimLines(readRepoFile("packages/core/test/docs-readme-samples.test.ts"));
    expect(source).toContain(trimLines(sample));
  });
});

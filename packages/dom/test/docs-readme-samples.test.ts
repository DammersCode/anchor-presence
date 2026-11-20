import { describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@dammers/anchor-presence-core";
import { createDomBinding } from "../src/index";
import { fileSample, readRepoFile, trimLines } from "../../react/test/doc-source";

const renderCursor = (_clientId: string, _x: number, _y: number) => {};

describe("dom README samples", () => {
  it("binds a client and draws visible cursors", () => {
    const { a: myTransport } = createInMemoryPair();

    const client = createPresenceClient({ transport: myTransport });
    const binding = createDomBinding(client);

    binding.subscribe(() => {
      for (const cursor of binding.getSnapshot()) {
        if (cursor.visible) renderCursor(cursor.clientId, cursor.x, cursor.y);
      }
    });
    expect(binding.getSnapshot()).toEqual([]);
    binding.dispose();
    client.dispose();
  });

  it("reads anchors from a custom attribute", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient({ transport });
    const raf = (callback: FrameRequestCallback) => window.requestAnimationFrame(callback);
    const caf = (handle: number) => window.cancelAnimationFrame(handle);

    const binding = createDomBinding(client, {
      anchorAttribute: "data-presence",
      maxSentAnchors: 4,
      resolution: { hitTest: true },
      environment: { raf, caf },
    });

    expect(binding.getSnapshot()).toEqual([]);
    binding.dispose();
    client.dispose();
  });

  it("match the README", () => {
    const source = trimLines(readRepoFile("packages/dom/test/docs-readme-samples.test.ts"));
    for (const marker of ["const binding = createDomBinding(client);", 'anchorAttribute: "data-presence"']) {
      const sample = fileSample("packages/dom/README.md", marker);
      const body = sample
        .split("\n")
        .filter((line) => !line.startsWith("//") && line.trim() !== "")
        .join("\n");
      expect(source.replaceAll("\n\n", "\n")).toContain(trimLines(body));
    }
  });
});

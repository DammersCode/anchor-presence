import { describe, expect, it, vi } from "vitest";
import { createWebSocketTransport } from "../src/index";
import type { VisibilityPolicy } from "../src/index";
import { defaultVisibilityPolicy as exportedPolicy } from "../src/resolver";
import { docSample, readRepoFile, trimLines } from "../../react/test/doc-source";

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

describe("visibility-policy.mdx: the default policy", () => {
  it("hides only a hidden tier", () => {
    const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
      resolution.tier === "hidden" ? "hide" : "show";

    for (const tier of ["anchor", "viewport", "hidden"] as const) {
      const input = {
        presence: { version: 1, clientId: "c", session: "s", sequence: 1, cursor: null },
        resolution: { tier, anchorId: null, pointVisible: true },
      } as const;
      expect(defaultVisibilityPolicy(input)).toBe(exportedPolicy(input));
    }
  });
});

describe("websocket-transport.mdx: subscribeClose", () => {
  it("accepts the close listener", () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    transport.subscribeClose((close) => {
      if (!close.willReconnect) {
        console.warn(`Relay closed the connection: ${close.code ?? "no code"} ${close.reason ?? ""}`);
      }
    });

    warn.mockRestore();
    expect(transport.subscribeClose).toBeTypeOf("function");
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/dom/test/docs-dom-samples-pins.test.ts"));
    const samples = [
      docSample("dom/visibility-policy.mdx", "const defaultVisibilityPolicy"),
      docSample("dom/websocket-transport.mdx", "transport.subscribeClose((close)"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});

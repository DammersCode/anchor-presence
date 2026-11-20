import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRepoFile, trimLines } from "./doc-source";

const pages = [
  "core/validation",
  "core/remote-presence",
  "core/in-memory-transport",
  "core/events",
  "core/presence-client",
  "core/codecs",
  "core/custom-codec",
  "core/custom-transport",
  "core/interpolation",
  "dom/resolution",
  "dom/binding",
  "dom/pointer-capture",
  "dom/visibility-policy",
  "dom/websocket-transport",
  "dom/api/websocket-transport",
  "dom/broadcast-channel-transport",
];

const normalize = (text: string) =>
  trimLines(text)
    .split("\n")
    .filter((line) => !line.includes("oxlint-disable"))
    .map((line) => line.replace(/;$/u, ""))
    .join("\n");

const testSources = ["core", "dom", "react"]
  .flatMap((pkg) =>
    readdirSync(`packages/${pkg}/test`)
      .filter((file) => /\.tsx?$/u.test(file) && file !== "docs-pinned-samples.test.ts")
      .map((file) => normalize(readRepoFile(`packages/${pkg}/test/${file}`))),
  )
  .join("\n");

describe("doc samples of the core and dom pages", () => {
  it.each(pages)("%s: every code block has a verbatim copy in a test", (page) => {
    const markdown = readRepoFile(`apps/docs/content/docs/${page}.mdx`);
    const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
      body
        .split("\n")
        .filter((line) => !line.startsWith("import "))
        .join("\n"),
    );
    const missing = blocks.filter((block) => !testSources.includes(normalize(block).trim()));
    expect(missing).toEqual([]);
  });
});

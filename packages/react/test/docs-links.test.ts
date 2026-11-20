import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const docsRoot = join(root, "apps/docs/content/docs");

const readText = (file: string) => readFileSync(file, "utf8").replaceAll("\r\n", "\n");

function walk(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const slugify = (text: string) =>
  text
    .replaceAll(/`([^`]*)`/gu, "$1")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replaceAll(/[*_]{1,2}(?=\S)([^*_]*)[*_]{1,2}/gu, "$1")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replaceAll(" ", "-");

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of readText(file).split("\n")) {
    if (/^\s*```/u.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^#{1,6}\s+(.*?)\s*$/u.exec(line);
    if (heading === null || heading[1] === undefined) continue;
    const explicit = /\s*\[#([^\]]+)\]$/u.exec(heading[1]);
    if (explicit?.[1] !== undefined) {
      anchors.add(explicit[1]);
      continue;
    }
    const base = slugify(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function pageFile(path: string): string | undefined {
  const base = join(docsRoot, path.replace(/^\/docs\/?/u, ""));
  return [`${base}.mdx`, join(base, "index.mdx")].find((candidate) => existsSync(candidate));
}

const readmes = [
  "README.md",
  "packages/core/README.md",
  "packages/dom/README.md",
  "packages/react/README.md",
];
const sources = [
  ...walk(docsRoot, ".mdx"),
  ...walk(join(root, "skills"), ".md"),
  ...readmes.map((file) => join(root, file)).filter((file) => existsSync(file)),
];

describe("internal docs links", () => {
  it("scans a plausible number of files", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it("resolves every /docs link to a page and heading", () => {
    const broken: string[] = [];
    for (const source of sources) {
      const text = readText(source);
      const links = text.matchAll(/(?:\]\(|href=")(\/docs(?:\/[^)#"\s]*)?)(?:#([^)"\s]*))?/gu);
      for (const [, path = "", fragment] of links) {
        if (path === "/docs") continue;
        const target = pageFile(path.replace(/\.md$/u, ""));
        const label = `${relative(root, source)} -> ${path}${fragment === undefined ? "" : `#${fragment}`}`;
        if (target === undefined) broken.push(`${label} (missing page)`);
        else if (fragment !== undefined && !anchorsOf(target).has(fragment))
          broken.push(`${label} (missing heading)`);
      }
    }
    expect(broken).toEqual([]);
  });
});

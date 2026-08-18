import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom's URL global can't resolve a relative specifier against import.meta.url reliably; use cwd instead.
const srcDir = join(process.cwd(), "packages/react/src");

// spec §3.3 / PLAN Phase 3 acceptance: react imports only core, dom, react, or relative paths
const importPattern = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
}

const allowedSpecifiers = new Set(["react", "@anchor-presence/core", "@anchor-presence/dom"]);

describe("react import boundary (spec §3.3)", () => {
  const files = listSourceFiles(srcDir);

  it("found source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} imports only react, "@anchor-presence/core", "@anchor-presence/dom", or relative paths`, () => {
      const contents = readFileSync(join(srcDir, file), "utf8");
      const specifiers = Array.from(contents.matchAll(importPattern), (m) => m[1]);
      for (const specifier of specifiers) {
        const allowed =
          allowedSpecifiers.has(specifier as string) ||
          (specifier as string).startsWith("./") ||
          (specifier as string).startsWith("../");
        expect(allowed, `unexpected import "${specifier}" in ${file}`).toBe(true);
      }
    });
  }
});

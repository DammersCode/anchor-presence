import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom's URL global can't resolve a relative specifier against import.meta.url reliably; use cwd instead.
const srcDir = join(process.cwd(), "packages/dom/src");

// spec §3.2 / PLAN Phase 2 acceptance: dom imports only core and relative paths
const importPattern = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/gu;

function isAllowedSpecifier(specifier: string): boolean {
  return specifier === "@anchor-presence/core" || specifier.startsWith("./") || specifier.startsWith("../");
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".ts"));
}

describe("dom import boundary (spec §3.2)", () => {
  const files = listTsFiles(srcDir);

  it("found source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} imports only "@anchor-presence/core" or relative paths`, () => {
      const contents = readFileSync(join(srcDir, file), "utf8");
      const specifiers = Array.from(contents.matchAll(importPattern), (m) => m[1]);
      for (const specifier of specifiers) {
        expect(isAllowedSpecifier(specifier), `unexpected import "${specifier}" in ${file}`).toBe(true);
      }
    });
  }
});

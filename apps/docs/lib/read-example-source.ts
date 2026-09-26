import fs from "node:fs";
import path from "node:path";

const repoRoot = path.join(process.cwd(), "..", "..");

// Every call site is a static string baked in at prerender time (see content/docs/**), never
// user input, so tracing the whole project for this dynamic path is unneeded at runtime.

/** Reads a file's real source for a docs code sample, so the sample can never drift from the code. */
export function readExampleSource(relativePath: string): string {
  const filePath = path.join(/* turbopackIgnore: true */ repoRoot, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/** Reads a file under this app (e.g. a demo component) for a docs code sample. */
export function readDocsSource(relativePath: string): string {
  const filePath = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

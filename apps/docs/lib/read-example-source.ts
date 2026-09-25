import fs from "node:fs";
import path from "node:path";

const repoRoot = path.join(process.cwd(), "..", "..");

/** Reads a file's real source for a docs code sample, so the sample can never drift from the code. */
export function readExampleSource(relativePath: string): string {
  const filePath = path.join(repoRoot, relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

/** Reads a file under this app (e.g. a demo component) for a docs code sample. */
export function readDocsSource(relativePath: string): string {
  const filePath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(filePath, "utf-8");
}

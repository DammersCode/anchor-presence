import { readFileSync } from "node:fs";

const withoutComments = (text, marker) =>
  text
    .split("\n")
    .map((line) => line.replace(marker, ""))
    .join("\n");

const configured = [
  ...withoutComments(readFileSync("vitest.config.ts", "utf8"), /\/\/.*$/u).matchAll(
    /name:\s*["']([^"']+)["']/gu,
  ),
].map((match) => match[1]);
const matrixProjectLines = withoutComments(readFileSync(".github/workflows/pr.yml", "utf8"), /#.*$/u)
  .split("\n")
  .filter((line) => /^\s*projects:/u.test(line));
const inWorkflow = new Set(
  [...matrixProjectLines.join("\n").matchAll(/--project\s+([\w-]+)/gu)].map((match) => match[1]),
);

const missing = configured.filter((name) => !inWorkflow.has(name));
const unknown = [...inWorkflow].filter((name) => !configured.includes(name));

if (configured.length === 0) {
  console.error("check-ci-projects: no vitest project found in vitest.config.ts");
  process.exit(1);
}
if (missing.length > 0 || unknown.length > 0) {
  if (missing.length > 0)
    console.error(`vitest projects missing from the pr.yml test matrix: ${missing.join(", ")}`);
  if (unknown.length > 0)
    console.error(`pr.yml names vitest projects that do not exist: ${unknown.join(", ")}`);
  process.exit(1);
}
console.log(`check-ci-projects: all ${configured.length} vitest projects run in pr.yml`);

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Leading whitespace differs between a sample and its copy inside a block, so compare trimmed lines.
export const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

export function trimmedTestSource(file: string): string {
  return trimLines(readRepoFile(`packages/react/test/${file}`))
    .split("\n")
    .filter((line) => !line.includes("oxlint-disable"))
    .join("\n");
}

// Returns the ts or tsx block of `page` that contains `marker`, without import lines.
export function docSample(page: string, marker: string): string {
  const markdown = readRepoFile(`apps/docs/content/docs/${page}`);
  const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${page}`);
  return block;
}

const stripSemicolon = (line: string) => line.replace(/;$/u, "");

// A doc line is present when a whole trimmed source line equals it, so a changed number fails.
export function missingLines(file: string, sample: string): string[] {
  const sourceLines = new Set(
    trimmedTestSource(file)
      .split("\n")
      .map((line) => stripSemicolon(line)),
  );
  return trimLines(sample)
    .split("\n")
    .map((line) => stripSemicolon(line))
    .filter((text) => text !== "" && !sourceLines.has(text));
}

export function missingSamples(file: string, samples: string[]): string[] {
  return samples.filter((sample) => missingLines(file, sample).length > 0);
}

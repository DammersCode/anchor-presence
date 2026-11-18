import { expect, it } from "vitest";
import { readRepoFile } from "./doc-source";

it("SCENE_NOTE_TEXT in lib/source.ts equals the text of components/scene-note.tsx", () => {
  const source = readRepoFile("apps/docs/lib/source.ts");
  const declared = /const SCENE_NOTE_TEXT =\s*"([^"]+)";/u.exec(source)?.[1];
  const component = readRepoFile("apps/docs/components/scene-note.tsx");
  const body = /<Callout type="warn">([\s\S]*?)<\/Callout>/u.exec(component)?.[1] ?? "";
  const rendered = body
    .replaceAll(/<code>([^<]*)<\/code>/gu, "`$1`")
    .replaceAll('{" "}', " ")
    .replaceAll("&apos;", "'")
    .replaceAll(/\s+/gu, " ")
    .trim();

  expect(declared).toBeDefined();
  expect(rendered).toBe(declared);
});

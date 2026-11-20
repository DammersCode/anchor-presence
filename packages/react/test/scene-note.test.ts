import { expect, it } from "vitest";
import { readRepoFile } from "./doc-source";

it("SCENE_NOTE_TEXT in lib/source.ts equals the text of components/scene-note.tsx", () => {
  const source = readRepoFile("apps/docs/lib/source.ts");
  const declared = /const SCENE_NOTE_TEXT =\s*"([^"]+)";/u.exec(source)?.[1];
  const component = readRepoFile("apps/docs/components/scene-note.tsx");
  const body = /<Callout type="info">([\s\S]*?)<\/Callout>/u.exec(component)?.[1] ?? "";
  const rendered = body
    .replaceAll(/<code>([^<]*)<\/code>/gu, "`$1`")
    .replaceAll(/<Link href="([^"]+)">\s*(.*?)\s*<\/Link>/gu, "[$2]($1)")
    .replaceAll('{" "}', " ")
    .replaceAll("&apos;", "'")
    .replaceAll(/\s+/gu, " ")
    .trim();

  expect(declared).toBeDefined();
  expect(rendered).toBe(declared);
});

it("the markdown export strips MDX icon imports before it inlines scene sources", () => {
  const source = readRepoFile("apps/docs/lib/source.ts");
  expect(source.indexOf('.replace(LUCIDE_IMPORT, "")')).toBeGreaterThan(-1);
  expect(source.indexOf('.replace(LUCIDE_IMPORT, "")')).toBeLessThan(
    source.indexOf(".replace(CODE_FROM_SOURCE"),
  );
});

it("the markdown export inlines sources after the tab dedent, so inlined code keeps its indentation", () => {
  const source = readRepoFile("apps/docs/lib/source.ts");
  expect(source.indexOf(".replace(CODE_FROM_SOURCE")).toBeGreaterThan(source.indexOf(".replace(TAB_BODY"));
});

it("the kanban scene source keeps its lucide import for the markdown export", () => {
  expect(readRepoFile("apps/docs/components/examples/kanban.tsx")).toMatch(
    /^import \{[^}]*\} from "lucide-react";$/mu,
  );
});

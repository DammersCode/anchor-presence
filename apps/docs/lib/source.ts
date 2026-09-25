import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import type { GeneratedDoc } from "fumadocs-typescript";
import { createElement } from "react";
import { Atom, Box, Compass, FlaskConical, MousePointer } from "lucide-react";
import { readDocsSource, readExampleSource } from "./read-example-source";
import { docsContentRoute, docsImageRoute, docsRoute, installPackages } from "./shared";
import { getTypeGenerator } from "./type-generator";

const icons = {
  compass: Compass,
  box: Box,
  "mouse-pointer": MousePointer,
  atom: Atom,
  "flask-conical": FlaskConical,
};

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) return undefined;
    const Icon = icons[icon as keyof typeof icons];
    return Icon ? createElement(Icon) : undefined;
  },
});

export function getPageImage(page: (typeof source)["$inferPage"]) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join("/")}`,
  };
}

export function getPageMarkdownUrl(page: (typeof source)["$inferPage"]) {
  const segments = [...page.slugs, "content.md"];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join("/")}`,
  };
}

const CODE_FROM_SOURCE = /<CodeFromSource (repo|docs)="([^"]+)" lang="([^"]+)" \/>/g;
const AUTO_TYPE_TABLE = /<AutoTypeTable path="([^"]+)" name="([^"]+)" \/>/g;
const DEMO = /<Demo \/>\n?/g;
const INSTALL_COMMAND = /<InstallCommand(?: packages="([^"]+)")? \/>/g;
const FENCE = "```";

function tableCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function typeTableMarkdown(doc: GeneratedDoc): string {
  const rows = doc.entries.map(
    (entry) =>
      `| \`${entry.name}${entry.required ? "" : "?"}\` | \`${tableCell(entry.simplifiedType)}\` | ${tableCell(entry.description)} |`,
  );
  return [`**${doc.name}**`, "", "| Property | Type | Description |", "| --- | --- | --- |", ...rows].join(
    "\n",
  );
}

// MDX components render nothing in markdown, so agents get the real code and type tables instead.
async function inlineComponents(markdown: string): Promise<string> {
  let out = markdown
    .replace(DEMO, "")
    .replace(
      INSTALL_COMMAND,
      (_tag, packages: string | undefined) =>
        `${FENCE}sh\nnpm install ${packages ?? installPackages}\n${FENCE}`,
    )
    .replace(CODE_FROM_SOURCE, (_tag, kind: string, file: string, lang: string) => {
      const code = kind === "repo" ? readExampleSource(file) : readDocsSource(file);
      return `${FENCE}${lang}\n${code.trimEnd()}\n${FENCE}`;
    });
  for (const [tag, path, name] of markdown.matchAll(AUTO_TYPE_TABLE)) {
    const docs = await getTypeGenerator().generateTypeTable({ path, name });
    out = out.replace(tag, docs.map(typeTableMarkdown).join("\n\n"));
  }
  return out;
}

export async function getLLMText(page: (typeof source)["$inferPage"]) {
  const processed = await inlineComponents(await page.data.getText("processed"));

  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}

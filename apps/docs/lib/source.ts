import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import type { GeneratedDoc } from "fumadocs-typescript";
import { createElement } from "react";
import { icons } from "lucide-react";
import { readDocsSource, readExampleSource } from "./read-example-source";
import { docsContentRoute, docsImageRoute, docsRoute, installPackages } from "./shared";
import { getTypeGenerator } from "./type-generator";

function toPascalCase(name: string): string {
  return name.replace(/(^|-)([a-z0-9])/gu, (_match, _dash, char: string) => char.toUpperCase());
}

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) return undefined;
    const Icon = icons[toPascalCase(icon) as keyof typeof icons];
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
const EXAMPLE_PREVIEW = /(?:^The demo runs this recipe[^\n]*:\n\n)?<ExamplePreview scene="[^"]+" \/>\n?/gm;
const INSTALL_COMMAND = /<InstallCommand(?: packages="([^"]+)")? \/>/g;
const MERMAID = /<Mermaid\s+chart="([\s\S]*?)"\s*\/>/g;
const WARN_CALLOUT = /<Callout type="warn">\s*([\s\S]*?)\s*<\/Callout>/g;
const SCENE_NOTE = /<SceneNote \/>/g;
const SCENE_NOTE_TEXT =
  "The scene takes `client`, `layout`, and `children` from the preview. In your app, create the client through the provider's `factory` with a real transport, and render your own status bar as `children`. The scene also uses docs theme classes such as `bg-fd-secondary`, `text-fd-muted-foreground`, and `bg-gradient-brand`. Replace them with your own styles.";
const LUCIDE_IMPORT = /^import \{[^}]*\} from "lucide-react";\n/gm;
// The catch-all excludes quotes, braces and "/" so each character has one match path (no backtracking blowup).
const CARD_ATTRIBUTES = String.raw`(?:"[^"]*"|\{[^}]*\}|[^>"{/])*?`;
const CARD = new RegExp(
  String.raw`^[ \t]*<Card\b${CARD_ATTRIBUTES}title="([^"]+)"${CARD_ATTRIBUTES}href="([^"]+)"${CARD_ATTRIBUTES}(?:/>|>\s*([\s\S]*?)\s*</Card>)`,
  "gm",
);
const STEP_BODY = /(<Step>)([\s\S]*?)(<\/Step>)/g;
const TAB_BODY = /(<Tab value="[^"]+">)([\s\S]*?)(<\/Tab>)/g;
const ACCORDION_BODY = /(<Accordion title="[^"]+">)([\s\S]*?)(<\/Accordion>)/g;
const TAB = /<Tab value="([^"]+)">/g;
const ACCORDION = /<Accordion title="([^"]+)">/g;
const STRUCTURE_TAGS = /^\s*<\/?(?:Cards|Tabs|Steps|Accordions)\b[^>]*>\s*\n?|<\/?(?:Tab|Step|Accordion)>/gm;
const FENCE = "```";

function unescapeMdxAttribute(value: string): string {
  return value.replaceAll("&#x22;", '"').replaceAll("&#x0A;", "\n").replaceAll("&#x26;", "&");
}

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

function warningQuote(body: string): string {
  const [first = "", ...rest] = body.split("\n").map((line) => line.trim());
  return [`> **Warning:** ${first}`, ...rest.map((line) => (line === "" ? ">" : `> ${line}`))].join("\n");
}

function dedentBody(_block: string, open: string, body: string, close: string): string {
  return open + body.replaceAll(/^ {4}/gm, "") + close;
}

// MDX components render nothing in markdown, so agents get the real code and type tables instead.
async function inlineComponents(markdown: string): Promise<string> {
  let out = markdown
    .replace(DEMO, "")
    .replace(EXAMPLE_PREVIEW, "")
    .replace(
      INSTALL_COMMAND,
      (_tag, packages: string | undefined) =>
        `${FENCE}sh\nnpm install ${packages ?? installPackages}\n${FENCE}`,
    )
    .replace(CODE_FROM_SOURCE, (_tag, kind: string, file: string, lang: string) => {
      const code = kind === "repo" ? readExampleSource(file) : readDocsSource(file);
      return `${FENCE}${lang}\n${code.trimEnd()}\n${FENCE}`;
    })
    .replace(
      MERMAID,
      (_tag, chart: string) =>
        `${FENCE}mermaid\n${unescapeMdxAttribute(chart).replace(/^`|`$/gu, "")}\n${FENCE}`,
    )
    .replace(WARN_CALLOUT, (_tag, body: string) => warningQuote(body))
    .replace(SCENE_NOTE, () => warningQuote(SCENE_NOTE_TEXT))
    .replace(LUCIDE_IMPORT, "")
    .replace(CARD, (_tag, title: string, href: string, body: string | undefined) =>
      body === undefined ? `- [${title}](${href})` : `- [${title}](${href}): ${body.replaceAll("\n", " ")}`,
    )
    .replace(STEP_BODY, dedentBody)
    .replace(TAB_BODY, dedentBody)
    .replace(ACCORDION_BODY, dedentBody)
    .replace(ACCORDION, (_tag, title: string) => `**${title}**\n`)
    .replace(STRUCTURE_TAGS, "")
    .replace(TAB, (_tag, name: string) => `\n**${name}**\n\n`);
  for (const [tag, path, name] of markdown.matchAll(AUTO_TYPE_TABLE)) {
    const docs = await getTypeGenerator().generateTypeTable({ path, name });
    out = out.replace(tag, docs.map(typeTableMarkdown).join("\n\n"));
  }
  return out;
}

export async function getLLMText(page: (typeof source)["$inferPage"]) {
  const processed = (await inlineComponents(await page.data.getText("processed"))).replaceAll(
    /^(#{1,6} .+?) \[#[\w-]+\]$/gmu,
    "$1",
  );

  return `# ${page.data.title} (${page.url})\n\n${processed.trim()}`;
}

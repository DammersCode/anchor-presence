import { llms } from "fumadocs-core/source";
import { source } from "@/lib/source";
import { siteUrl } from "@/lib/shared";

export const revalidate = false;

const TAIL = [
  "",
  "## Packages",
  "",
  "- `@dammers/anchor-presence-core`: protocol, codecs, client, presence store. No DOM, no React.",
  "- `@dammers/anchor-presence-dom`: anchors, pointer capture, resolver, native WebSocket transport.",
  "- `@dammers/anchor-presence-react`: provider, hooks, cursor components.",
  "",
  `- [GitHub](https://github.com/DammersCode/anchor-presence): source code, examples, issues.`,
  "",
].join("\n");

export async function GET() {
  const index = await llms(source).index();
  const withMdLinks = index
    .replace(/\]\((\/docs\/[^)]+)\)/g, `](${siteUrl}$1.md)`)
    .replace(/\]\((\/docs)\)/g, `](${siteUrl}/docs.md)`);
  return new Response(withMdLinks + TAIL);
}

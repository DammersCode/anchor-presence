import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { readDocsSource, readExampleSource } from "@/lib/read-example-source";
import { codeThemes } from "@/lib/shared";

type Props = {
  /** Path relative to the repo root (e.g. "examples/socketio/transport.ts"). */
  repo?: string;
  /** Path relative to apps/docs (e.g. "components/demo/demo-scene.tsx"). */
  docs?: string;
  lang: string;
};

/** Renders a file's real, current source as a highlighted code block — the sample can't drift. */
export function CodeFromSource({ repo, docs, lang }: Props) {
  const code = repo ? readExampleSource(repo) : docs ? readDocsSource(docs) : "";
  return <DynamicCodeBlock code={code} lang={lang} options={{ themes: codeThemes }} />;
}

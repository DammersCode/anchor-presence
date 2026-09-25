import { createFileSystemGeneratorCache, createGenerator } from "fumadocs-typescript";
import { AutoTypeTable as AutoTypeTableImpl } from "fumadocs-typescript/ui";

let cachedGenerator: ReturnType<typeof createGenerator> | null = null;

function getGenerator() {
  cachedGenerator ??= createGenerator({ cache: createFileSystemGeneratorCache(".next/fumadocs-typescript") });
  return cachedGenerator;
}

/** Server-component-only: generates a prop table from a real TS type at build time. */
export function AutoTypeTable(props: Record<string, unknown>) {
  return (
    <div className="auto-type-table">
      <AutoTypeTableImpl {...props} generator={getGenerator()} />
    </div>
  );
}

import { createFileSystemGeneratorCache, createGenerator } from "fumadocs-typescript";

let cachedGenerator: ReturnType<typeof createGenerator> | null = null;

/** One shared type-table generator for the rendered pages and their markdown copies. */
export function getTypeGenerator() {
  cachedGenerator ??= createGenerator({ cache: createFileSystemGeneratorCache(".next/fumadocs-typescript") });
  return cachedGenerator;
}

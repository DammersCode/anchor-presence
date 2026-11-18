import type { MDXComponents } from "mdx/types";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { AutoTypeTable } from "@/components/auto-type-table";
import { InstallCommand } from "@/components/install-command";
import { Demo } from "@/components/demo";
import { ExamplePreview } from "@/components/examples/_preview/example-preview";
import { CodeFromSource } from "@/components/code-from-source";
import { Mermaid } from "@/components/mermaid";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AutoTypeTable,
    InstallCommand,
    Demo,
    ExamplePreview,
    CodeFromSource,
    Mermaid,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    Step,
    Steps,
    Tabs,
    Tab,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

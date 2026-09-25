import type { MDXComponents } from "mdx/types";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { AutoTypeTable } from "@/components/auto-type-table";
import { InstallCommand } from "@/components/install-command";
import { Demo } from "@/components/demo";
import { CodeFromSource } from "@/components/code-from-source";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AutoTypeTable,
    InstallCommand,
    Demo,
    CodeFromSource,
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

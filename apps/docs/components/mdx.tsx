import type { ComponentProps } from "react";
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
import { SceneNote } from "@/components/scene-note";

export function getMDXComponents(components?: MDXComponents) {
  let tableCount = 0;
  return {
    ...defaultMdxComponents,
    table: (props: ComponentProps<"table">) => (
      <div
        role="region"
        aria-label={`Table ${++tableCount}`}
        tabIndex={0}
        className="relative overflow-auto prose-no-margin my-6"
      >
        <table {...props} />
      </div>
    ),
    AutoTypeTable,
    InstallCommand,
    Demo,
    ExamplePreview,
    CodeFromSource,
    Mermaid,
    SceneNote,
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

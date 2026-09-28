import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";
import { SkipLink } from "@/components/skip-link";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <DocsLayout
        tree={source.getPageTree()}
        {...baseOptions()}
        sidebar={{
          footer: (
            <a
              key="llms"
              href="/llms.txt"
              className="text-fd-muted-foreground hover:text-fd-foreground text-xs"
            >
              llms.txt
            </a>
          ),
        }}
      >
        {children}
      </DocsLayout>
    </>
  );
}

import type { ReactNode } from "react";
import { mainContentId } from "@/lib/shared";

export function SkipLink(): ReactNode {
  return (
    <a
      href={`#${mainContentId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:bg-fd-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-fd-foreground focus:shadow-md focus:outline-2 focus:outline-fd-ring"
    >
      Skip to content
    </a>
  );
}

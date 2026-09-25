import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";
import { appName, docsRoute, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2">
          <Logo className="size-[22px]" />
          {appName}
        </span>
      ),
    },
    links: [
      { text: "Docs", url: docsRoute, active: "nested-url" },
      { text: "Examples", url: `${docsRoute}/examples`, active: "nested-url" },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}

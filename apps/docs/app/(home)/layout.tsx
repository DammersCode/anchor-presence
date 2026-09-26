import type { ReactNode } from "react";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { SkipLink } from "@/components/skip-link";
import { baseOptions, githubLink } from "@/lib/layout.shared";
import { docsRoute } from "@/lib/shared";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <HomeLayout
        {...baseOptions()}
        links={[
          { text: "Docs", url: docsRoute },
          { text: "Examples", url: `${docsRoute}/examples` },
          { text: "Skills", url: `${docsRoute}/skills` },
          githubLink,
        ]}
      >
        {children}
      </HomeLayout>
    </>
  );
}

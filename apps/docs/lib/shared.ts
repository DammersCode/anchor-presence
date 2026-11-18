export const appName = "anchor-presence";
export const docsRoute = "/docs";
export const docsImageRoute = "/og/docs";
export const docsContentRoute = "/llms.mdx/docs";
export const mainContentId = "main-content";

// Single source of truth for the deployed docs origin (used in llms.txt, README links, OG).
export const siteUrl = "https://anchor-presence.vercel.app";

export const gitConfig = {
  user: "DammersCode",
  repo: "anchor-presence",
  branch: "main",
};

/** The packages every install command adds unless a page names others. */
export const installPackages = "@anchor-presence/core @anchor-presence/dom @anchor-presence/react";

/** Code themes; the high-contrast light theme keeps every token at WCAG AA (github-light has one at 3.5:1). */
export const codeThemes = { light: "github-light-high-contrast", dark: "github-dark-high-contrast" } as const;

import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // fumadocs LLMs integration: /docs/<page>.md serves the page as raw markdown for AI agents.
  async redirects() {
    return [
      { source: "/docs", destination: "/docs/get-started/introduction", permanent: true },
      { source: "/docs/get-started", destination: "/docs/get-started/introduction", permanent: true },
      { source: "/docs/examples", destination: "/docs/examples/basics", permanent: true },
      {
        source: "/docs/getting-started/introduction",
        destination: "/docs/get-started/introduction",
        permanent: true,
      },
      {
        source: "/docs/getting-started/installation",
        destination: "/docs/get-started/installation",
        permanent: true,
      },
      {
        source: "/docs/getting-started/quick-start",
        destination: "/docs/get-started/quick-start",
        permanent: true,
      },
      {
        source: "/docs/concepts/anchors-and-fallbacks",
        destination: "/docs/get-started/concepts/anchors-and-fallbacks",
        permanent: true,
      },
      {
        source: "/docs/concepts/architecture",
        destination: "/docs/get-started/concepts/architecture",
        permanent: true,
      },
      {
        source: "/docs/concepts/ui-context",
        destination: "/docs/get-started/concepts/ui-context",
        permanent: true,
      },
      {
        source: "/docs/guides/responsive-layouts",
        destination: "/docs/get-started/responsive-layouts",
        permanent: true,
      },
      { source: "/docs/guides/security", destination: "/docs/get-started/security", permanent: true },
      { source: "/docs/guides/performance", destination: "/docs/get-started/performance", permanent: true },
      {
        source: "/docs/guides/troubleshooting",
        destination: "/docs/get-started/troubleshooting",
        permanent: true,
      },
      { source: "/docs/guides/ai-agents", destination: "/docs/get-started/ai-agents", permanent: true },
      {
        source: "/docs/guides/ssr-and-strict-mode",
        destination: "/docs/react/ssr-and-strict-mode",
        permanent: true,
      },
      { source: "/docs/guides/react", destination: "/docs/react", permanent: true },
      { source: "/docs/guides/transports", destination: "/docs/core/transports", permanent: true },
      { source: "/docs/guides/codecs", destination: "/docs/core/codecs", permanent: true },
      { source: "/docs/reference/core", destination: "/docs/core/reference", permanent: true },
      { source: "/docs/reference/dom", destination: "/docs/dom/reference", permanent: true },
      { source: "/docs/reference/react", destination: "/docs/react/reference", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*/content.md" }];
  },
};

export default withMDX(config);

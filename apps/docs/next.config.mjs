import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // fumadocs LLMs integration: /docs/<page>.md serves the page as raw markdown for AI agents.
  async redirects() {
    return [{ source: "/docs", destination: "/docs/getting-started/introduction", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*/content.md" }];
  },
};

export default withMDX(config);

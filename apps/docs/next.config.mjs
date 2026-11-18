import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // fumadocs LLMs integration: /docs/<page>.md serves the page as raw markdown for AI agents.
  async redirects() {
    return [
      { source: "/docs", destination: "/docs/get-started/introduction", permanent: false },
      { source: "/docs/get-started", destination: "/docs/get-started/introduction", permanent: false },
      { source: "/docs/react/cursor-context", destination: "/docs/react/local-context", permanent: true },
      { source: "/docs/react/cursor-presence", destination: "/docs/react/remote-presence", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*/content.md" }];
  },
};

export default withMDX(config);

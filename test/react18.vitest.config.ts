import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("..", import.meta.url));
const react18 = `${root}.react18/node_modules`;

// Runs the React package tests against React 18 from .react18 (npm i react@18 react-dom@18 there first).
export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: /^react-dom(\/.*)?$/u, replacement: `${react18}/react-dom$1` },
      { find: /^react(\/.*)?$/u, replacement: `${react18}/react$1` },
    ],
  },
  test: {
    name: "react-18",
    environment: "jsdom",
    include: ["packages/react/test/**/*.test.{ts,tsx}"],
    // The router libraries in this file need React 19.
    exclude: ["packages/react/test/frameworks.test.tsx"],
    setupFiles: ["test/quiet-library-warnings.ts", "packages/react/test/setup.ts"],
    server: { deps: { inline: [/react/u] } },
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vitest/config";
import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";

const librarySource = /packages[\\/]react[\\/]src[\\/].*\.tsx?$/u;

function reactCompilerPlugin(): Plugin {
  return {
    name: "react-compiler-library-source",
    enforce: "pre",
    async transform(code, id) {
      if (!librarySource.test(id)) return null;
      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: id.endsWith("x") ? ["typescript", "jsx"] : ["typescript"] },
        plugins: [reactCompiler],
        sourceMaps: true,
      });
      return result?.code ? { code: result.code, map: result.map ?? null } : null;
    },
  };
}

// Runs the React package tests with the React Compiler applied to the library source.
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [reactCompilerPlugin()],
  test: {
    name: "react-compiler",
    environment: "jsdom",
    include: ["packages/react/test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/quiet-library-warnings.ts", "packages/react/test/setup.ts"],
  },
});

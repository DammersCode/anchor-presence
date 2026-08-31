import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/test/**/*.test.ts"],
          benchmark: {
            include: ["packages/core/bench/**/*.bench.ts"],
          },
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["packages/dom/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "react",
          environment: "jsdom",
          include: ["packages/react/test/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "demo",
          environment: "node",
          include: ["apps/demo/src/cursors/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "socketio-example",
          environment: "node",
          include: ["examples/socketio/**/*.test.ts"],
        },
      },
    ],
  },
});

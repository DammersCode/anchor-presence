import { defineConfig } from "vitest/config";

// Real servers, real sockets and the docs scan run in parallel, so the 5 s default fails on a busy machine.
const TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["packages/core/test/**/*.test.ts"],
          setupFiles: ["test/quiet-library-warnings.ts"],
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["packages/dom/test/**/*.test.ts"],
          setupFiles: ["test/quiet-library-warnings.ts"],
        },
      },
      {
        test: {
          name: "react",
          environment: "jsdom",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["packages/react/test/**/*.test.{ts,tsx}"],
          setupFiles: ["test/quiet-library-warnings.ts", "packages/react/test/setup.ts"],
        },
      },
      {
        test: {
          name: "demo",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["apps/demo/src/cursors/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["apps/server/test/**/*.test.ts"],
          setupFiles: ["test/quiet-library-warnings.ts"],
        },
      },
      {
        test: {
          name: "built-packages",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["test/built-packages/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "audit-skill",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["test/audit-skill/**/*.test.mjs", "test/scripts/**/*.test.mjs"],
        },
      },
      {
        test: {
          name: "socketio-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/socketio/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "signalr-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/signalr/**/*.test.ts"],
          hookTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        test: {
          name: "bun-native-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/bun-native/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "node-ws-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/node-ws/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "hono-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/hono/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "elysia-example",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/elysia/**/*.test.ts"],
          setupFiles: ["test/quiet-library-warnings.ts"],
        },
      },
      {
        test: {
          name: "relay-conformance",
          environment: "node",
          testTimeout: TEST_TIMEOUT_MS,
          include: ["examples/_shared/**/*.test.ts"],
        },
      },
    ],
  },
});

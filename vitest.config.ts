import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/test/**/*.test.ts"],
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
          name: "server",
          environment: "node",
          include: ["apps/server/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "audit-skill",
          environment: "node",
          include: ["test/audit-skill/**/*.test.mjs"],
        },
      },
      {
        test: {
          name: "socketio-example",
          environment: "node",
          include: ["examples/socketio/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "signalr-example",
          environment: "node",
          include: ["examples/signalr/**/*.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      {
        test: {
          name: "bun-native-example",
          environment: "node",
          include: ["examples/bun-native/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "node-ws-example",
          environment: "node",
          include: ["examples/node-ws/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "hono-example",
          environment: "node",
          include: ["examples/hono/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "elysia-example",
          environment: "node",
          include: ["examples/elysia/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "relay-conformance",
          environment: "node",
          include: ["examples/_shared/**/*.test.ts"],
        },
      },
    ],
  },
});

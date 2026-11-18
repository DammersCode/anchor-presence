import { defineConfig, devices } from "@playwright/test";

// The relay shares port 8787 with other worktrees; the demo dev server runs on its own port so it serves this worktree's code.
const DEMO_PORT = Number(process.env.E2E_DEMO_PORT ?? 5917);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${DEMO_PORT}/`,
    trace: "retain-on-failure",
  },
  projects: [
    // CI uses the runner's preinstalled Chrome (channel) so playwright install can skip the chromium download
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(isCI ? { channel: "chrome" } : {}) } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "bun run --cwd apps/server dev",
      port: 8787,
      reuseExistingServer: !isCI,
    },
    {
      command: `bun run --cwd apps/demo dev -- --port ${DEMO_PORT} --strictPort`,
      port: DEMO_PORT,
      reuseExistingServer: false,
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

// Cross-layout invariant proof (spec §17): two clients, different layouts, same semantic cursor position.
//
// The relay stays on the spec's default port 8787: it broadcasts opaque bytes per room with no message
// inspection, so it is safe to share with another worktree's relay instance already listening there
// (rooms are isolated via a random UUID suffix, see uniqueRoom() in helpers.ts) — and apps/server is on
// the DO-NOT-CHANGE list, so its hardcoded connection port in the demo's createWebSocketTransport setup cannot move.
// reuseExistingServer stays on for the relay so this works whether or not one is already up.
//
// The demo dev server (vite) cannot share with another worktree's instance — it serves that worktree's
// source, not this one's data-testid additions — so it runs on a dedicated port with reuseExistingServer
// off, guaranteeing every run serves this worktree's code.
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
      reuseExistingServer: true,
    },
    {
      command: `bun run --cwd apps/demo dev -- --port ${DEMO_PORT} --strictPort`,
      port: DEMO_PORT,
      reuseExistingServer: false,
    },
  ],
});

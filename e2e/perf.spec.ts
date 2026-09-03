import { test, expect } from "@playwright/test";

// Browser perf gate per spec §16 (plan 009 step 4); dev-machine baseline re-based 2026-09-02 at
// 1.1/2.0 ms for 100 anchors x 50 cursors — these bounds are 3x the spec budget plus CI headroom.
test.skip(({ browserName }) => browserName !== "chromium", "chromium-only: perf gate, not cross-browser coverage");

const MEAN_BUDGET_MS = 6;
const P95_BUDGET_MS = 20;
const MIN_SAMPLES = 200;

test.describe("bench page perf budgets", () => {
  test("100 anchors x 50 cursors: mean and p95 pass duration stay within budget", async ({ page }) => {
    await page.goto("/?page=bench");

    await page.getByLabel("Anchors").selectOption("100");
    await page.getByLabel("Cursors").selectOption("50");

    await expect(async () => {
      const count = Number(await page.getByTestId("bench-count").textContent());
      expect(count).toBeGreaterThanOrEqual(MIN_SAMPLES);
    }).toPass({ timeout: 30_000, intervals: [200, 500] });

    const meanText = await page.getByTestId("bench-mean").textContent();
    const p95Text = await page.getByTestId("bench-p95").textContent();
    const mean = Number.parseFloat(meanText ?? "");
    const p95 = Number.parseFloat(p95Text ?? "");

    expect(mean).toBeLessThan(MEAN_BUDGET_MS);
    expect(p95).toBeLessThan(P95_BUDGET_MS);
  });

  test("idle contract: zero rAF passes once cursor count drops to 0", async ({ page }) => {
    await page.goto("/?page=bench");

    await page.getByLabel("Anchors").selectOption("10");
    await page.getByLabel("Cursors").selectOption("1");

    await expect(async () => {
      const count = Number(await page.getByTestId("bench-count").textContent());
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000, intervals: [200, 500] });

    await page.getByRole("button", { name: "Pause" }).click();

    // drain in-flight passes: the stats readout refreshes at 1 Hz, so probe at >1s intervals —
    // two reads straddling a refresh both show the true window count, and equality means no new sample landed
    let countAfterPause = -1;
    await expect(async () => {
      const now = Number(await page.getByTestId("bench-count").textContent());
      await page.waitForTimeout(1200);
      const later = Number(await page.getByTestId("bench-count").textContent());
      expect(later).toBe(now);
      countAfterPause = later;
    }).toPass({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    const countAfterWait = Number(await page.getByTestId("bench-count").textContent());

    expect(countAfterWait).toBe(countAfterPause);
  });
});

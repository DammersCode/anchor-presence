// Opt-in scale measurement for the "Measured at scale" docs section (plan 027). Not a CI gate:
// skipped unless PERF_SCALE=1, chromium only, and its bounds are loose sanity checks, not budgets.
import { test, expect } from "@playwright/test";

test.skip(process.env.PERF_SCALE !== "1", "opt-in: set PERF_SCALE=1 to run the scale benchmark");
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "chromium-only: scale bench, not cross-browser coverage",
);

const MIN_SAMPLES = 200;
const SANITY_MEAN_BUDGET_MS = 50;
const SANITY_P95_BUDGET_MS = 100;

const SCENARIOS = [
  { anchors: 500, cursors: 100 },
  { anchors: 1000, cursors: 200 },
  { anchors: 2000, cursors: 200 },
] as const;

type ScaleRow = { anchors: number; cursors: number; mean: number; p95: number; count: number };

test.describe("bench page scale measurement", () => {
  test("500x100, 1000x200, 2000x200: mean and p95 resolve-pass duration @slow", async ({ page }) => {
    test.setTimeout(180_000);
    const rows: ScaleRow[] = [];

    for (const { anchors, cursors } of SCENARIOS) {
      await page.goto("/?page=bench");
      await page.getByLabel("Anchors").selectOption(String(anchors));
      await page.getByLabel("Cursors").selectOption(String(cursors));

      await expect(async () => {
        const count = Number(await page.getByTestId("bench-count").textContent());
        expect(count).toBeGreaterThanOrEqual(MIN_SAMPLES);
      }).toPass({ timeout: 60_000, intervals: [200, 500] });

      const meanText = await page.getByTestId("bench-mean").textContent();
      const p95Text = await page.getByTestId("bench-p95").textContent();
      const countText = await page.getByTestId("bench-count").textContent();
      const mean = Number.parseFloat(meanText ?? "");
      const p95 = Number.parseFloat(p95Text ?? "");
      const count = Number.parseInt(countText ?? "", 10);

      rows.push({ anchors, cursors, mean, p95, count });
    }

    console.log("\n[perf-scale] receiver main-thread resolve-pass duration (ms)");
    console.table(
      rows.map((r) => ({
        "anchors x cursors": `${r.anchors}x${r.cursors}`,
        "mean (ms)": r.mean.toFixed(3),
        "p95 (ms)": r.p95.toFixed(3),
        samples: r.count,
      })),
    );

    for (const row of rows) {
      // loose sanity bounds only: this spec measures and reports, it does not gate CI
      expect(row.mean, `${row.anchors}x${row.cursors} mean`).toBeLessThan(SANITY_MEAN_BUDGET_MS);
      expect(row.p95, `${row.anchors}x${row.cursors} p95`).toBeLessThan(SANITY_P95_BUDGET_MS);
    }
  });
});

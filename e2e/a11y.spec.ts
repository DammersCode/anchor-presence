import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { moveToAnchor, openPair, uniqueRoom } from "./helpers";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "chromium-only: axe rules do not depend on the engine",
);

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.describe("demo accessibility", () => {
  test("has no WCAG violations with a remote cursor and the settings dialog open", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 900 },
      receiverViewport: { width: 1280, height: 900 },
      room: uniqueRoom("a11y"),
    });

    await moveToAnchor(sender, "stats.revenue");
    const cursor = receiver.locator(`[data-testid="remote-cursor"][data-cursor-name="${senderName}"]`);
    await expect(cursor).toBeVisible();
    await expect(cursor).toHaveAttribute("aria-hidden", "true");
    await expect(receiver.getByRole("status").filter({ hasText: /^1 online$/ })).toBeVisible();
    await expectNoAxeViolations(receiver);

    await receiver.getByTestId("anchor-topbar.settings").click();
    await expect(receiver.getByRole("dialog", { name: "Workspace settings" })).toBeVisible();
    await expect(receiver.getByRole("switch", { name: "Email notifications" })).toBeVisible();
    await expectNoAxeViolations(receiver);
  });

  test("keeps sidebar controls named when collapsed", async ({ page }) => {
    await page.goto(`/?name=Solo&room=${uniqueRoom("a11y-sidebar")}`);
    const toggle = page.getByRole("button", { name: "Toggle sidebar" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Orders", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

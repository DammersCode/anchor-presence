import { expect, test } from "@playwright/test";

test.describe("core primitives fixture", () => {
  test("pair, event parser, validation, store and dev warnings work in a real browser", async ({ page }) => {
    await page.goto("/?page=core-primitives");

    await expect(page.getByTestId("pair-remote-count")).toHaveText("1");
    await expect(page.getByTestId("parser-accepted")).toHaveText("1");
    await expect(page.getByTestId("validate-valid")).toHaveText("accepted");
    await expect(page.getByTestId("validate-too-long")).toHaveText("0 anchors");
    await expect(page.getByTestId("store-count")).toHaveText("1");
    await expect(page.getByTestId("dev-mode")).toHaveText("true");
    await expect(page.getByTestId("listener-error")).toHaveText("reported");
    await expect(page.getByTestId("warn-once-count")).toHaveText("1");
  });
});

import { expect, test } from "@playwright/test";

const NAMES = ["Ada", "Bo", "Cy"] as const;

test.describe("in-memory room fixture", () => {
  test("three providers see each other's cursors, one-shot events and the provider context", async ({
    page,
  }) => {
    await page.goto("/?page=in-memory-room");
    for (const name of NAMES) await expect(page.getByTestId(`context-${name}`)).toHaveText("ready");

    for (const mover of NAMES) {
      const box = await page.getByTestId(`box-${mover}`).boundingBox();
      if (box === null) throw new Error(`box-${mover} is not measurable`);
      await expect(async () => {
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (const viewer of NAMES.filter((name) => name !== mover)) {
          const cursor = page.locator(`#cursor-${viewer}-${mover}`);
          await expect(cursor).toBeVisible({ timeout: 500 });
          await expect(cursor).toContainText(mover);
        }
      }).toPass();
    }

    await page.getByTestId("ping-Ada").click();
    for (const viewer of ["Bo", "Cy"]) {
      await expect(page.getByTestId(`events-${viewer}`)).toHaveText("ping,pong");
    }
    await expect(page.getByTestId("events-Ada")).toHaveText("");
  });
});

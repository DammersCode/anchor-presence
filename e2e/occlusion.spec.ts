import { test, expect } from "@playwright/test";
import { expectAnchorNear, moveToAnchor, openPair, uniqueRoom } from "./helpers";

test.skip(({ browserName }) => browserName !== "chromium", "chromium-only: clipped layout reproduction");

test.describe("clipped anchor occlusion", () => {
  test("hides a cursor when the receiver clips the sender's Delete button", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 900 },
      receiverViewport: { width: 1280, height: 900 },
      room: uniqueRoom("clipped-delete"),
    });

    await receiver.addStyleTag({
      content: ".occlusion-test-scroll { max-height: 96px !important; overflow-y: auto !important; }",
    });
    await receiver.locator('[data-testid="anchor-orders.row:3"]').evaluate((row) => {
      const wrapper = row.closest("table")?.parentElement;
      if (wrapper === null || wrapper === undefined) throw new Error("orders table wrapper not found");
      wrapper.classList.add("occlusion-test-scroll");
    });

    const senderDelete = sender
      .locator('[data-testid="anchor-orders.row:3"]')
      .getByRole("button", { name: "Delete" });
    await expect(senderDelete).toBeVisible();
    // the table overflows its wrapper at this viewport and layout settles late (scrollbar),
    // so scroll the button into view and re-target until the point really hits it
    await senderDelete.scrollIntoViewIfNeeded();
    await expect(async () => {
      const box = await senderDelete.boundingBox();
      if (box === null) throw new Error("sender Delete button is not measurable");
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await sender.mouse.move(cx, cy);
      const hit = await sender.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number);
          return el instanceof HTMLElement && el.closest("button") !== null;
        },
        [cx, cy] as const,
      );
      expect(hit).toBe(true);
    }).toPass({ timeout: 5_000, intervals: [100, 200, 400] });

    await expect(async () => {
      const clipped = await receiver.locator('[data-testid="anchor-orders.row:3"]').evaluate((row) => {
        const target = row.querySelector("button:last-child");
        const wrapper = row.closest("table")?.parentElement;
        if (target === null || wrapper === null) return false;
        return target.getBoundingClientRect().top >= wrapper.getBoundingClientRect().bottom;
      });
      expect(clipped).toBe(true);
    }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });

    const remoteCursor = receiver.locator(`[data-testid="remote-cursor"][data-cursor-name="${senderName}"]`);
    const outOfView = receiver.locator(`[data-testid="presence-out-of-view"][data-cursor-name="${senderName}"]`);
    await expect(receiver.locator('[data-testid="presence-count"]')).toHaveText(/[1-9]\d* online/);
    await expect(async () => {
      expect((await remoteCursor.count()) + (await outOfView.count())).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
    await expect(outOfView).toBeVisible();
    await expect(remoteCursor).toHaveCount(0);

    await sender.mouse.move(1, 1);
    await sender.evaluate(() => {
      document.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
    });
    await expect(outOfView).toHaveCount(0);
  });

  test("keeps normalized stats points within two pixels across layouts", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 720 },
      receiverViewport: { width: 1920, height: 1080 },
      room: uniqueRoom("precision-grid"),
    });

    for (const [u, v] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]] as const) {
      await moveToAnchor(sender, "stats.revenue", u, v);
      await expectAnchorNear(receiver, senderName, "stats.revenue", u, v, 2);
    }
  });
});

import { test, expect } from "@playwright/test";
import { openPair, moveToAnchor, anchorLocator, expectAnchorNear, getRemoteCursorPos, uniqueRoom } from "./helpers";

// Scenarios 3-8 run chromium-only (per T13 instructions) to keep total CI time sane; scenarios 1-2
// in cross-layout.spec.ts already cover all three browsers for the core resolution math.
test.skip(({ browserName }) => browserName !== "chromium", "chromium-only: see cross-layout.spec.ts for cross-browser coverage");

test.describe("cross-layout scenarios", () => {
  test("sidebar-mismatch: receiver's collapsed nav item still resolves correctly", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("sidebar-mismatch"),
    });

    await receiver.locator('[data-testid="anchor-sidebar.toggle"]').click();
    await expect(receiver.locator('[data-testid="anchor-nav.settings"]')).toBeVisible();

    await moveToAnchor(sender, "nav.settings", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "nav.settings", 0.5, 0.5);
  });

  test("flex-wrap: sender points at 4th stat card, receiver resolves it on its wrapped layout", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1920, height: 1080 },
      receiverViewport: { width: 640, height: 900 },
      room: uniqueRoom("flex-wrap"),
    });

    await moveToAnchor(sender, "stats.conversion", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.conversion", 0.5, 0.5);
  });

  test("receiver-scroll (Invariant 7): cursor stays glued to its anchor through a local scroll with no new packets", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("receiver-scroll"),
    });

    await moveToAnchor(sender, "orders.row:5", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "orders.row:5", 0.5, 0.5);

    // Freeze the sender: no further pointer movement, so no new presence packets arrive.
    const before = await getRemoteCursorPos(receiver, senderName);

    const scrollDelta = 200;
    await receiver.evaluate((dy) => {
      const main = document.querySelector("main");
      main?.scrollBy(0, dy);
    }, scrollDelta);

    await expect(async () => {
      const box = await anchorLocator(receiver, "orders.row:5").boundingBox();
      const after = await getRemoteCursorPos(receiver, senderName);
      expect(box).not.toBeNull();
      expect(after.visible).toBe(true);
      const expectedY = box!.y + box!.height * 0.5;
      expect(Math.abs(after.y - expectedY)).toBeLessThanOrEqual(3);
      // The cursor moved with the scroll (shift), not merely stayed put from a stale position.
      expect(Math.abs(after.y - before.y)).toBeGreaterThan(5);
    }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
  });

  test("dialog-context-policy: cursor hides when receiver's dialog is closed, then reappears when receiver opens its own dialog", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("dialog-context"),
    });

    // Sender opens Settings and points inside it.
    await sender.locator('[data-testid="anchor-topbar.settings"]').click();
    await expect(sender.locator('[data-testid="anchor-settings.dialog"]')).toBeVisible();
    await moveToAnchor(sender, "settings.dialog.invite", 0.5, 0.5);

    // Receiver has not opened its dialog: cursor for the sender is hidden, "in Settings" shown instead.
    await expect(
      receiver.locator(`[data-testid="presence-in-settings"][data-cursor-name="${senderName}"]`),
    ).toBeVisible();
    await expect(
      receiver.locator(`[data-testid="remote-cursor"][data-cursor-name="${senderName}"]`),
    ).toHaveCount(0);

    // Receiver opens its own dialog: cursor appears over the receiver's dialog.
    await receiver.locator('[data-testid="anchor-topbar.settings"]').click();
    await expect(receiver.locator('[data-testid="anchor-settings.dialog"]')).toBeVisible();

    await expectAnchorNear(receiver, senderName, "settings.dialog.invite", 0.5, 0.5);
  });

  test("reload-recovery: cursor reappears on the receiver shortly after a reload via the sender's next messages", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("reload-recovery"),
    });

    await moveToAnchor(sender, "stats.orders", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.orders", 0.5, 0.5);

    await receiver.reload();
    await expect(receiver.locator('[data-testid="presence-count"]')).toBeVisible({ timeout: 15_000 });

    // The receiver only recovers presence once a fresh packet arrives (session-based recovery, no
    // heartbeat wait), so keep the sender moving right away rather than waiting on presence count first.
    const deadline = Date.now() + 5_000;
    let visible = false;
    while (Date.now() < deadline && !visible) {
      await moveToAnchor(sender, "stats.orders", 0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2);
      visible = (await receiver.locator('[data-testid="remote-cursor"]').count()) > 0;
      if (!visible) await receiver.waitForTimeout(100);
    }

    expect(visible).toBe(true);
  });

  test("spring-interpolator: custom interpolator (demo-authored, not core) still resolves the anchor correctly", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("spring-interpolator"),
      receiverExtraQuery: "interp=spring",
    });

    await moveToAnchor(sender, "stats.conversion", 0.5, 0.5);
    // Springs settle slower than the linear default, so allow more time than expectAnchorNear's default poll.
    await expect(async () => {
      const box = await anchorLocator(receiver, "stats.conversion").boundingBox();
      const pos = await getRemoteCursorPos(receiver, senderName);
      expect(box).not.toBeNull();
      expect(pos.visible).toBe(true);
      const expectedX = box!.x + box!.width * 0.5;
      const expectedY = box!.y + box!.height * 0.5;
      expect(Math.abs(pos.x - expectedX)).toBeLessThanOrEqual(3);
      expect(Math.abs(pos.y - expectedY)).toBeLessThanOrEqual(3);
    }).toPass({ timeout: 10_000, intervals: [100, 200, 300] });
  });

  test("leave: cursor hides when the sender's pointer leaves the viewport", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("leave"),
    });

    await moveToAnchor(sender, "stats.revenue", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.revenue", 0.5, 0.5);

    // Move the mouse to the very edge and dispatch pointerleave on the document to simulate leaving the viewport.
    await sender.mouse.move(1, 1);
    await sender.evaluate(() => {
      document.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
    });

    await expect(async () => {
      const count = await receiver.locator(`[data-testid="remote-cursor"][data-cursor-name="${senderName}"]`).count();
      expect(count).toBe(0);
    }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
  });
});

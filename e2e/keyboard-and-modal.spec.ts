import { expect, test } from "@playwright/test";
import {
  anchorLocator,
  expectAnchorNear,
  getRemoteCursorPos,
  moveToAnchor,
  openPair,
  uniqueRoom,
} from "./helpers";

test.describe("modal stacking, keyboard focus, and touch clear", () => {
  test("the remote cursor renders above the receiver's dialog overlay and stays pointer-transparent", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("modal-stacking"),
    });

    // The receiver opens the settings dialog (a z-50 fixed overlay).
    await receiver.locator('[data-testid="anchor-topbar.settings"]').click();
    await expect(receiver.locator('[data-testid="anchor-settings.dialog"]')).toBeVisible();

    // The sender opens the same dialog and points inside it.
    await sender.locator('[data-testid="anchor-topbar.settings"]').click();
    await expect(sender.locator('[data-testid="anchor-settings.dialog"]')).toBeVisible();
    await moveToAnchor(sender, "settings.dialog.invite", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "settings.dialog.invite", 0.5, 0.5);

    // The cursor's z-index beats the overlay's, so it paints above the dialog.
    const stacking = await receiver.evaluate((name: string) => {
      const cursor = document.querySelector<HTMLElement>(
        `[data-testid="remote-cursor"][data-cursor-name="${name}"]`,
      );
      const overlay = document
        .querySelector<HTMLElement>('[data-testid="anchor-settings.dialog"]')
        ?.closest("div.fixed");
      return {
        cursorZ: cursor ? getComputedStyle(cursor).zIndex : null,
        overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
      };
    }, senderName);
    expect(stacking.cursorZ).not.toBeNull();
    expect(stacking.overlayZ).not.toBeNull();
    expect(Number(stacking.cursorZ)).toBeGreaterThan(Number(stacking.overlayZ));

    // The cursor is pointer-transparent: the topmost hit at its position is the dialog, not the cursor.
    const pos = await getRemoteCursorPos(receiver, senderName);
    const hitIsCursor = await receiver.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="remote-cursor"]') !== null,
      [pos.x, pos.y],
    );
    expect(hitIsCursor).toBe(false);
    const hit = await receiver.evaluate(([x, y]) => document.elementFromPoint(x, y), [pos.x, pos.y]);
    expect(hit).not.toBeNull();
  });

  test("focusing an element publishes a cursor at its center", async ({ browser }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("keyboard-focus"),
    });

    await sender.locator('[data-testid="anchor-topbar.settings"]').focus();

    await expectAnchorNear(receiver, senderName, "topbar.settings", 0.5, 0.5);
  });

  test("the touch cursor is visible while the finger is down and gone after the lift", async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP touch dispatch is chromium-only");

    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("touch-clear"),
      senderHasTouch: true,
    });

    const box = await anchorLocator(sender, "stats.orders").boundingBox();
    if (!box) throw new Error("anchor not found or not visible: stats.orders");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const cdp = await sender.context().newCDPSession(sender);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await expectAnchorNear(receiver, senderName, "stats.orders", 0.5, 0.5);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ x, y, id: 1 }],
    });
    await expect(async () => {
      const pos = await getRemoteCursorPos(receiver, senderName);
      expect(pos.visible).toBe(false);
    }).toPass({ timeout: 5_000, intervals: [50, 100, 200] });
  });
});

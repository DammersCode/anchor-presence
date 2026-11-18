import { expect, test } from "@playwright/test";
import { openPair, uniqueRoom } from "./helpers";

test.describe("one-shot events", () => {
  test("a reaction and a chat line reach the other page as toasts", async ({ browser }) => {
    const { sender, receiver } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("events"),
    });

    await sender.locator('[data-testid="reaction-party"]').click();
    await expect(receiver.locator('[data-testid="reaction-toast"]', { hasText: "Sender: 🎉" })).toBeVisible();

    await sender.keyboard.press("/");
    await sender.locator('[data-testid="chat-input"]').fill("hello <b>there</b>");
    await sender.keyboard.press("Enter");
    const toast = receiver.locator('[data-testid="reaction-toast"]', { hasText: "Sender: hello" });
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText("Sender: hello <b>there</b>");
    await expect(toast.locator("b")).toHaveCount(0);

    await expect(receiver.locator('[data-testid="reaction-toast"]')).toHaveCount(0, { timeout: 8000 });
  });
});

test.describe("leaving", () => {
  test("a closed page leaves the online list at once, not after the stale timeout", async ({ browser }) => {
    const { sender, receiver } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("leave"),
    });
    await expect(sender.locator('[data-testid="presence-count"]')).toHaveText(/1 online/);

    await receiver.close({ runBeforeUnload: true });

    await expect(sender.locator('[data-testid="presence-count"]')).toHaveText(/0 online/, { timeout: 5000 });
  });
});

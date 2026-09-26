import { test, expect } from "@playwright/test";
import { expectAnchorNear, installSocketDropController, moveToAnchor, openPair, uniqueRoom } from "./helpers";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "chromium-only: relay socket control needs page.routeWebSocket",
);

test.describe("relay resilience", () => {
  test("in-place socket drop: the sender reconnects through the real backoff path and the cursor reappears", async ({
    browser,
  }) => {
    let dropOnce: (() => Promise<void>) | null = null;

    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("socket-drop"),
      beforeSenderGoto: async (page) => {
        ({ dropOnce } = await installSocketDropController(page, /:8787\//));
      },
    });

    await moveToAnchor(sender, "stats.revenue", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.revenue", 0.5, 0.5);

    if (dropOnce === null) throw new Error("socket drop controller was not installed");
    await dropOnce();

    // No page reload: the sender's own createWebSocketTransport instance detects the close and
    // schedules the real exponential-backoff reconnect (packages/dom/src/transport.ts).
    await expect(sender.locator('[data-anchor="topbar.presence"]')).toContainText(/Reconnecting|Connecting/, {
      timeout: 5_000,
    });
    await expect(sender.locator('[data-anchor="topbar.presence"]')).toContainText("Connected", {
      timeout: 15_000,
    });

    // A fresh move after reconnect must reach the receiver at the new position, proving live
    // data flow resumed rather than the receiver merely keeping its last-known (stale) cursor.
    await moveToAnchor(sender, "stats.conversion", 0.75, 0.25);
    await expectAnchorNear(receiver, senderName, "stats.conversion", 0.75, 0.25);
  });
});

test.describe("room isolation", () => {
  test("a third page in a different room never sees the pair's cursor and stays at 0 peers", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 800 },
      receiverViewport: { width: 1280, height: 800 },
      room: uniqueRoom("isolated-pair"),
    });

    const outsiderContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const outsider = await outsiderContext.newPage();
    await outsider.goto(`/?name=Outsider&room=${encodeURIComponent(uniqueRoom("isolated-outsider"))}`);

    await moveToAnchor(sender, "stats.revenue", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.revenue", 0.5, 0.5);

    await moveToAnchor(sender, "stats.conversion", 0.75, 0.25);
    await moveToAnchor(sender, "stats.orders", 0.25, 0.75);

    await expect(outsider.locator('[data-testid="remote-cursor"]')).toHaveCount(0);
    await expect(outsider.locator('[data-testid="presence-count"]')).toHaveText("0 online");

    await outsiderContext.close();
  });
});

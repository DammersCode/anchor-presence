import { test } from "@playwright/test";
import { openPair, moveToAnchor, expectAnchorNear, uniqueRoom } from "./helpers";

// Core invariant proof (spec §1, §17): two clients with different layouts show the cursor at the
// same SEMANTIC position. These two scenarios run on all three browsers; the rest of the suite
// (cross-layout-chromium.spec.ts) runs chromium-only to keep CI time sane.

test.describe("cross-layout core invariant", () => {
  test("different-viewports: receiver resolves sender's anchor point onto its own layout", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 720 },
      receiverViewport: { width: 1920, height: 1080 },
      room: uniqueRoom("viewports"),
    });

    await moveToAnchor(sender, "stats.revenue", 0.5, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.revenue", 0.5, 0.5);
  });

  test("element-size-proportionality: u/v position scales to receiver's differently sized element", async ({
    browser,
  }) => {
    const { sender, receiver, senderName } = await openPair(browser, {
      senderViewport: { width: 1280, height: 720 },
      receiverViewport: { width: 1920, height: 1080 },
      room: uniqueRoom("proportionality"),
    });

    await moveToAnchor(sender, "stats.revenue", 0.75, 0.5);
    await expectAnchorNear(receiver, senderName, "stats.revenue", 0.75, 0.5);
  });
});

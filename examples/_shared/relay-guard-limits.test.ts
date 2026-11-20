import { expect, it } from "vitest";
import { safeAuthCheck } from "./relay-guard";

const request = { token: "t", room: "main", origin: "", headers: {} };

it("refuses an identity whose clientId is longer than 100 characters", async () => {
  expect(await safeAuthCheck(() => ({ clientId: "x".repeat(101) }))(request)).toBe(false);
  expect(await safeAuthCheck(() => ({ clientId: "x".repeat(100) }))(request)).toEqual({
    clientId: "x".repeat(100),
  });
});

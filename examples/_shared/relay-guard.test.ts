import { describe, expect, it } from "vitest";
import { RateLimiter, safeAuthCheck } from "./relay-guard";

describe("RateLimiter", () => {
  it("keeps refilling after the clock steps back", () => {
    let now = 10_000;
    const limiter = new RateLimiter(1, 1, () => now);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
    now = 5_000;
    expect(limiter.tryConsume()).toBe(false);
    now = 6_000;
    expect(limiter.tryConsume()).toBe(true);
  });
});

describe("safeAuthCheck", () => {
  const request = { token: "t", room: "main", origin: "", headers: {} };

  it("refuses an identity whose clientId contains the connection separator", async () => {
    expect(await safeAuthCheck(() => ({ clientId: "alice~bob" }))(request)).toBe(false);
  });

  it("admits a plain identity", async () => {
    expect(await safeAuthCheck(() => ({ clientId: "alice" }))(request)).toEqual({ clientId: "alice" });
  });
});

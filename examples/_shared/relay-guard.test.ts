import { describe, expect, it } from "vitest";
import { bindIdentity, RateLimiter, safeAuthCheck } from "./relay-guard";

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

describe("bindIdentity", () => {
  const frame = JSON.stringify({ version: 1, clientId: "x", user: { name: "CEO" } });

  it("removes a user the peer chose when the identity carries none", () => {
    const out = bindIdentity(frame, { clientId: "mallory" }, "c1");
    const parsed = JSON.parse(new TextDecoder().decode(out ?? new Uint8Array()));
    expect(parsed.clientId).toBe("mallory~c1");
    expect(parsed.user).toBeUndefined();
  });

  it("writes the user of the identity", () => {
    const out = bindIdentity(frame, { clientId: "mallory", user: { name: "Mallory" } }, "c1");
    expect(JSON.parse(new TextDecoder().decode(out ?? new Uint8Array())).user).toEqual({ name: "Mallory" });
  });
});

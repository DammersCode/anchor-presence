import { afterEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";

afterEach(() => {
  vi.useRealTimers();
});

describe("dispose and the event rate limit", () => {
  it("clears the sweep timer on dispose", () => {
    vi.useFakeTimers();
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const running = vi.getTimerCount();
    client.dispose();
    expect(vi.getTimerCount()).toBeLessThan(running);
  });

  it("keeps working past 512 distinct senders", () => {
    const { a, b } = createInMemoryPair();
    const receiver = createPresenceClient({
      transport: b,
      clientId: "R",
      now: () => 0,
      eventRateLimit: { burst: 100, perSecond: 100, totalPerSecond: 100_000 },
    });
    void a.connect?.();
    void b.connect?.();
    let received = 0;
    receiver.subscribeEvents(() => (received += 1));
    for (let index = 0; index < 600; index += 1) {
      const sender = createPresenceClient({ transport: a, clientId: "s-" + index });
      sender.sendEvent("ping");
      sender.dispose();
    }
    expect(received).toBe(600);
    receiver.dispose();
  });
});

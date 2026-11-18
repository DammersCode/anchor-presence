import { expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";

it("warns when heartbeatIntervalMs is at least half of the default staleTimeoutMs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { a } = createInMemoryPair();
  const client = createPresenceClient({ transport: a, heartbeatIntervalMs: 40_000 });
  expect(warn.mock.calls.flat().join(" ")).toMatch(/staleTimeoutMs \(70000\) is at most twice/u);
  client.dispose();
});

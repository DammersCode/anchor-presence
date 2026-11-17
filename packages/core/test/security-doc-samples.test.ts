import { describe, expect, it } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryPair } from "../src/in-memory-transport";

describe("security guide samples", () => {
  it("builds a client with a parseUser that checks the shape", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient<unknown, { name: string; avatar?: string }>({
      transport,
      parseUser: (value) => {
        const { name, avatar } = value as { name?: unknown; avatar?: unknown };
        if (typeof name !== "string") return undefined;
        return typeof avatar === "string" ? { name, avatar } : { name };
      },
    });
    expect(client.getRemotePresence()).toEqual([]);
    client.dispose();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { createBroadcastChannelTransport } from "../src/broadcast-transport";

const open: { disconnect(): void }[] = [];

afterEach(() => {
  for (const transport of open.splice(0)) transport.disconnect();
});

function pair() {
  const name = `test-${Math.random()}`;
  const a = createBroadcastChannelTransport(name);
  const b = createBroadcastChannelTransport(name);
  open.push(a, b);
  void a.connect();
  void b.connect();
  return { a, b };
}

describe("createBroadcastChannelTransport", () => {
  it("delivers bytes to the other transport and not to the sender", async () => {
    const { a, b } = pair();
    const seenByA: Uint8Array[] = [];
    const seenByB: Uint8Array[] = [];
    a.subscribe((data) => seenByA.push(data));
    b.subscribe((data) => seenByB.push(data));

    void a.send(new Uint8Array([1, 2, 3]));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(seenByB.map((data) => [...data])).toEqual([[1, 2, 3]]);
    expect(seenByA).toEqual([]);
  });

  it("reports its status and sends nothing before connect", () => {
    const transport = createBroadcastChannelTransport(`test-${Math.random()}`);
    open.push(transport);
    const states: string[] = [];
    transport.subscribeStatus?.((status) => states.push(status));
    void transport.connect();
    void transport.disconnect();
    expect(states).toEqual(["disconnected", "connected", "disconnected"]);
  });
});

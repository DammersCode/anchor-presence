import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "../src/client";
import { createInMemoryRoom } from "../src/in-memory-transport";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ids = (client: ReturnType<typeof createPresenceClient>): string[] =>
  client
    .getRemoteSnapshot()
    .map((peer) => peer.clientId)
    .toSorted();

function joinThree() {
  const room = createInMemoryRoom();
  const clients = ["A", "B", "C"].map((clientId) =>
    createPresenceClient({ transport: room.join(), clientId, staleTimeoutMs: 1000 }),
  );
  clients.forEach((client) => client.setLocalCursor({ anchors: [{ id: "x", u: 0.5, v: 0.5 }] }));
  vi.advanceTimersByTime(100);
  return clients;
}

describe("createInMemoryRoom", () => {
  it("joins connected transports", () => {
    expect(createInMemoryRoom().join().getStatus()).toBe("connected");
  });

  it("shows three clients each other and never themselves", () => {
    const clients = joinThree();
    expect(ids(clients[0]!)).toEqual(["B", "C"]);
    expect(ids(clients[1]!)).toEqual(["A", "C"]);
    expect(ids(clients[2]!)).toEqual(["A", "B"]);
    clients.forEach((client) => client.dispose());
  });

  it("removes a peer on the others when its client leaves", () => {
    const clients = joinThree();
    clients[2]!.dispose();
    expect(ids(clients[0]!)).toEqual(["B"]);
    expect(ids(clients[1]!)).toEqual(["A"]);
    clients[0]!.dispose();
    clients[1]!.dispose();
  });

  it("expires a peer whose transport disconnects, and shows it again after connect()", () => {
    const room = createInMemoryRoom();
    const quiet = room.join();
    const a = createPresenceClient({ transport: room.join(), clientId: "A", staleTimeoutMs: 1000 });
    const b = createPresenceClient({ transport: quiet, clientId: "B", staleTimeoutMs: 1000 });
    vi.advanceTimersByTime(100);
    expect(ids(a)).toEqual(["B"]);

    void quiet.disconnect();
    vi.advanceTimersByTime(5000);
    expect(ids(a)).toEqual([]);

    void quiet.connect();
    vi.advanceTimersByTime(5000);
    expect(ids(a)).toEqual(["B"]);
    a.dispose();
    b.dispose();
  });

  it("delivers nothing to a disconnected transport and drops its sends", () => {
    const room = createInMemoryRoom();
    const a = room.join();
    const b = room.join();
    const c = room.join();
    const received: string[] = [];
    b.subscribe(() => received.push("b"));
    c.subscribe(() => received.push("c"));
    void b.disconnect();
    void a.send(bytes(1));
    expect(received).toEqual(["c"]);
    void b.send(bytes(2));
    expect(received).toEqual(["c"]);
  });

  it("delivers in send order to every other transport", () => {
    const room = createInMemoryRoom();
    const a = room.join();
    const b = room.join();
    const c = room.join();
    const seen: string[] = [];
    a.subscribe((data) => seen.push("a" + data[0]));
    b.subscribe((data) => seen.push("b" + data[0]));
    c.subscribe((data) => seen.push("c" + data[0]));
    void a.send(bytes(1));
    void b.send(bytes(2));
    expect(seen).toEqual(["b1", "c1", "a2", "c2"]);
  });

  it("delivers in a microtask with async: true", async () => {
    const room = createInMemoryRoom({ async: true });
    const a = room.join();
    const b = room.join();
    const received: number[] = [];
    b.subscribe((data) => received.push(data[0]!));
    void a.send(bytes(7));
    expect(received).toEqual([]);
    await Promise.resolve();
    expect(received).toEqual([7]);
  });
});

import type { HubConnectionStatus } from "@dammers/use-signalr-react";
import { describe, expect, it } from "vitest";
import {
  createSignalRTransport,
  mapStatus,
  type SignalRHarness,
} from "./client/src/transport";

// A fake harness standing in for the live use-signalr connection. The adapter
// is the unit under test, so the connection is mocked, not spun up. `deliver`
// pushes a payload to only the handler the adapter has attached, so the test
// can model the "attached while connected / detached otherwise" lifecycle the
// transport drives via onConnected / onDisconnected.
function createHarness(initial: HubConnectionStatus = "connected"): {
  harness: SignalRHarness;
  received: string[];
  attachCount: { n: number };
  detachCount: { n: number };
  deliver: (payload: string) => void;
  fireStatus: () => void;
  setStatus: (s: HubConnectionStatus) => void;
} {
  let status: HubConnectionStatus = initial;
  let handler: ((payload: string) => void) | null = null;
  const received: string[] = [];
  const statusListeners = new Set<() => void>();
  const attachCount = { n: 0 };
  const detachCount = { n: 0 };

  return {
    harness: {
      send: async (payload) => {
        received.push(payload);
      },
      onConnected: (next) => {
        handler = next;
        attachCount.n += 1;
      },
      onDisconnected: () => {
        handler = null;
        detachCount.n += 1;
      },
      getStatus: () => status,
      subscribeStatus: (listener) => {
        statusListeners.add(listener);
        return () => {
          statusListeners.delete(listener);
        };
      },
    },
    received,
    attachCount,
    detachCount,
    deliver: (payload) => {
      handler?.(payload);
    },
    setStatus: (s) => {
      status = s;
    },
    fireStatus: () => {
      for (const listener of statusListeners) listener();
    },
  };
}

const JSON_MESSAGE = JSON.stringify({
  version: 1,
  clientId: "client-b",
  session: "s-b",
  sequence: 3,
  cursor: { anchors: [{ id: "overview-card", u: 0.25, v: 0.5 }] },
});

describe("createSignalRTransport", () => {
  it("attaches the event handler while the hub is connected and delivers payloads", () => {
    const fake = createHarness("connected");
    const { transport } = createSignalRTransport(fake.harness);

    expect(fake.attachCount.n).toBe(1);

    const seen: Uint8Array[] = [];
    const off = transport.subscribe((data) => seen.push(data));

    fake.deliver(JSON_MESSAGE);

    expect(seen).toHaveLength(1);
    expect(new TextDecoder().decode(seen[0]!)).toBe(JSON_MESSAGE);
    off();
  });

  it("stops delivering after the data subscription is removed", () => {
    const fake = createHarness("connected");
    const { transport } = createSignalRTransport(fake.harness);

    const seen: Uint8Array[] = [];
    const off = transport.subscribe((data) => seen.push(data));
    off();

    fake.deliver(JSON_MESSAGE);

    expect(seen).toHaveLength(0);
  });

  it("fans out to every active data subscriber", () => {
    const fake = createHarness("connected");
    const { transport } = createSignalRTransport(fake.harness);

    const first: Uint8Array[] = [];
    const second: Uint8Array[] = [];
    transport.subscribe((data) => first.push(data));
    transport.subscribe((data) => second.push(data));

    fake.deliver(JSON_MESSAGE);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("drops a send while the hub is not connected", async () => {
    const fake = createHarness("connecting");
    const { transport } = createSignalRTransport(fake.harness);

    // No attachment while connecting.
    expect(fake.attachCount.n).toBe(0);

    await expect(
      transport.send(new TextEncoder().encode(JSON_MESSAGE)),
    ).resolves.toBeUndefined();
    expect(fake.received).toHaveLength(0);

    fake.setStatus("disconnected");
    fake.fireStatus();

    await expect(
      transport.send(new TextEncoder().encode(JSON_MESSAGE)),
    ).resolves.toBeUndefined();
    expect(fake.received).toHaveLength(0);
  });

  it("sends the JSON payload once connected", async () => {
    const fake = createHarness("connected");
    const { transport } = createSignalRTransport(fake.harness);

    await expect(
      transport.send(new TextEncoder().encode(JSON_MESSAGE)),
    ).resolves.toBeUndefined();
    expect(fake.received).toHaveLength(1);
    expect(JSON.parse(fake.received[0]!)).toMatchObject({
      clientId: "client-b",
      sequence: 3,
      cursor: { anchors: [{ id: "overview-card", u: 0.25, v: 0.5 }] },
    });
  });

  it("attaches when the hub transitions to connected and detaches when it leaves", () => {
    const fake = createHarness("connecting");
    const { transport } = createSignalRTransport(fake.harness);

    const seen: Uint8Array[] = [];
    transport.subscribe((data) => seen.push(data));

    // Not attached while connecting, so payloads do not reach subscribers.
    fake.deliver(JSON_MESSAGE);
    expect(seen).toHaveLength(0);

    // Transition to connected: attach.
    fake.setStatus("connected");
    fake.fireStatus();
    expect(fake.attachCount.n).toBe(1);

    fake.deliver(JSON_MESSAGE);
    expect(seen).toHaveLength(1);

    // Transition to reconnecting: detach, payloads ignored while down.
    fake.setStatus("reconnecting");
    fake.fireStatus();
    expect(fake.detachCount.n).toBe(1);
    fake.deliver(JSON_MESSAGE);
    expect(seen).toHaveLength(1);

    // Transition back to connected: re-attach.
    fake.setStatus("connected");
    fake.fireStatus();
    expect(fake.attachCount.n).toBe(2);
    expect(fake.detachCount.n).toBe(1);

    fake.deliver(JSON_MESSAGE);
    expect(seen).toHaveLength(2);
  });

  it("reports the current status on subscribe and tracks hub status changes", () => {
    const fake = createHarness("connecting");
    const { transport } = createSignalRTransport(fake.harness);

    const seen: string[] = [];
    const off = transport.subscribeStatus!((status) => seen.push(status));

    expect(seen).toEqual(["connecting"]);

    fake.setStatus("connected");
    fake.fireStatus();
    expect(seen).toEqual(["connecting", "connected"]);

    fake.setStatus("reconnecting");
    fake.fireStatus();
    expect(seen).toEqual(["connecting", "connected", "reconnecting"]);

    fake.setStatus("disconnected");
    fake.fireStatus();
    expect(seen).toEqual([
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
    ]);

    off();
  });

  it("maps the 'reconnected' hub status onto 'connected'", () => {
    expect(mapStatus("reconnected")).toBe("connected");
    expect(mapStatus("disconnected")).toBe("disconnected");
    expect(mapStatus("connected")).toBe("connected");
  });

  it("stops emitting status after the status subscription is removed", () => {
    const fake = createHarness("connecting");
    const { transport } = createSignalRTransport(fake.harness);

    const seen: string[] = [];
    const off = transport.subscribeStatus!((status) => seen.push(status));
    off();

    fake.setStatus("connected");
    fake.fireStatus();

    // No emission to the detached listener, but the transport still tracks
    // the status internally (so a later subscribeStatus sees the new value).
    expect(seen).toEqual(["connecting"]);
  });

  it("dispose detaches the event handler and stops emitting", () => {
    const fake = createHarness("connected");
    const { transport, dispose } = createSignalRTransport(fake.harness);
    transport.subscribe(() => {});

    dispose();
    expect(fake.detachCount.n).toBe(1);

    // After dispose, no delivery.
    const seen: Uint8Array[] = [];
    transport.subscribe((data) => seen.push(data));
    fake.deliver(JSON_MESSAGE);
    expect(seen).toHaveLength(0);
  });
});

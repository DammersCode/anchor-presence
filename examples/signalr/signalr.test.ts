import { HubConnectionState, type HubConnection } from "@microsoft/signalr";
import { describe, expect, it } from "vitest";
import { createSignalRTransport, mapStatus } from "./transport";

// A minimal fake standing in for the parts of HubConnection the transport touches.
// signalr-hub.test.ts covers the real hub; this file covers status mapping and the
// send-while-disconnected drop, which the real hub test cannot exercise deterministically.
function createFakeConnection(initial: HubConnectionState = HubConnectionState.Connected): {
  connection: HubConnection;
  received: string[];
  deliver: (payload: string) => void;
  setState: (state: HubConnectionState) => void;
  fireClose: () => void;
  fireReconnecting: () => void;
  fireReconnected: () => void;
} {
  let state = initial;
  let handler: ((payload: string) => void) | null = null;
  const received: string[] = [];
  const closedCallbacks: Array<() => void> = [];
  const reconnectingCallbacks: Array<() => void> = [];
  const reconnectedCallbacks: Array<() => void> = [];

  const connection = {
    get state() {
      return state;
    },
    send: async (_method: string, payload: string) => {
      received.push(payload);
    },
    on: (_event: string, next: (payload: string) => void) => {
      handler = next;
    },
    off: () => {
      handler = null;
    },
    onclose: (callback: () => void) => closedCallbacks.push(callback),
    onreconnecting: (callback: () => void) => reconnectingCallbacks.push(callback),
    onreconnected: (callback: () => void) => reconnectedCallbacks.push(callback),
  } as unknown as HubConnection;

  return {
    connection,
    received,
    deliver: (payload) => handler?.(payload),
    setState: (next) => {
      state = next;
    },
    fireClose: () => {
      for (const callback of closedCallbacks) callback();
    },
    fireReconnecting: () => {
      for (const callback of reconnectingCallbacks) callback();
    },
    fireReconnected: () => {
      for (const callback of reconnectedCallbacks) callback();
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
  it("delivers PresenceReceived payloads to subscribers", () => {
    const fake = createFakeConnection();
    const transport = createSignalRTransport(fake.connection);

    const seen: Uint8Array[] = [];
    const off = transport.subscribe((data) => seen.push(data));

    fake.deliver(JSON_MESSAGE);

    expect(seen).toHaveLength(1);
    expect(new TextDecoder().decode(seen[0]!)).toBe(JSON_MESSAGE);
    off();
  });

  it("stops delivering after the data subscription is removed", () => {
    const fake = createFakeConnection();
    const transport = createSignalRTransport(fake.connection);

    const seen: Uint8Array[] = [];
    const off = transport.subscribe((data) => seen.push(data));
    off();

    fake.deliver(JSON_MESSAGE);

    expect(seen).toHaveLength(0);
  });

  it("fans out to every active data subscriber", () => {
    const fake = createFakeConnection();
    const transport = createSignalRTransport(fake.connection);

    const first: Uint8Array[] = [];
    const second: Uint8Array[] = [];
    transport.subscribe((data) => first.push(data));
    transport.subscribe((data) => second.push(data));

    fake.deliver(JSON_MESSAGE);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("drops a send while the hub is not connected", async () => {
    const fake = createFakeConnection(HubConnectionState.Connecting);
    const transport = createSignalRTransport(fake.connection);

    await expect(transport.send(new TextEncoder().encode(JSON_MESSAGE))).resolves.toBeUndefined();
    expect(fake.received).toHaveLength(0);
  });

  it("sends the JSON payload once connected", async () => {
    const fake = createFakeConnection(HubConnectionState.Connected);
    const transport = createSignalRTransport(fake.connection);

    await expect(transport.send(new TextEncoder().encode(JSON_MESSAGE))).resolves.toBeUndefined();
    expect(fake.received).toHaveLength(1);
    expect(JSON.parse(fake.received[0]!)).toMatchObject({
      clientId: "client-b",
      sequence: 3,
      cursor: { anchors: [{ id: "overview-card", u: 0.25, v: 0.5 }] },
    });
  });

  it("reports the current status on subscribe and tracks hub status changes", () => {
    const fake = createFakeConnection(HubConnectionState.Connecting);
    const transport = createSignalRTransport(fake.connection);

    const seen: string[] = [];
    const off = transport.subscribeStatus!((status) => seen.push(status));

    expect(seen).toEqual(["connecting"]);

    fake.fireReconnected();
    expect(seen).toEqual(["connecting", "connected"]);

    fake.fireReconnecting();
    expect(seen).toEqual(["connecting", "connected", "reconnecting"]);

    fake.fireClose();
    expect(seen).toEqual(["connecting", "connected", "reconnecting", "disconnected"]);

    off();
  });

  it("stops emitting status after the status subscription is removed", () => {
    const fake = createFakeConnection(HubConnectionState.Connecting);
    const transport = createSignalRTransport(fake.connection);

    const seen: string[] = [];
    const off = transport.subscribeStatus!((status) => seen.push(status));
    off();

    fake.fireReconnected();

    expect(seen).toEqual(["connecting"]);
  });

  it("maps every HubConnectionState onto a ConnectionStatus", () => {
    expect(mapStatus(HubConnectionState.Connected)).toBe("connected");
    expect(mapStatus(HubConnectionState.Reconnecting)).toBe("reconnecting");
    expect(mapStatus(HubConnectionState.Disconnected)).toBe("disconnected");
    expect(mapStatus(HubConnectionState.Connecting)).toBe("connecting");
    expect(mapStatus(HubConnectionState.Disconnecting)).toBe("connecting");
  });
});

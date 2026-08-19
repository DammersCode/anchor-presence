import { bench, describe } from "vitest";
import { jsonCodec } from "../src/codec";
import { RemotePresenceStore } from "../src/store";
import { validatePresence } from "../src/validate";
import type { CursorPresence } from "../src/protocol";
import type { LiveCursorTransport } from "../src/transport";

function fourAnchorMessage(clientId: string, sequence: number): CursorPresence {
  return {
    version: 1,
    clientId,
    session: `${clientId}-s`,
    sequence,
    cursor: {
      anchors: [
        { id: "a1", u: 0.1, v: 0.2 },
        { id: "a2", u: 0.3, v: 0.4 },
        { id: "a3", u: 0.5, v: 0.6 },
        { id: "a4", u: 0.7, v: 0.8 },
      ],
      viewport: { u: 0.5, v: 0.5 },
    },
    user: { name: clientId, color: "#6366f1" },
  };
}

const decodedMessage: unknown = JSON.parse(JSON.stringify(fourAnchorMessage("bench-client", 1)));
const encodedMessage = jsonCodec.encode(fourAnchorMessage("bench-client", 1));

describe("hot path", () => {
  bench("validatePresence on a decoded 4-anchor message", () => {
    validatePresence(decodedMessage);
  });

  bench("jsonCodec.decode + validatePresence on encoded bytes", () => {
    const decoded = jsonCodec.decode(encodedMessage);
    validatePresence(decoded);
  });

  bench("store.ingest steady-state: 64 clients, sequential sequences", () => {
    const store = new RemotePresenceStore({ maxRemoteClients: 64 });
    for (let i = 0; i < 64; i++) store.ingest(fourAnchorMessage(`client-${i}`, 0));
    let sequence = 1;
    return () => {
      for (let i = 0; i < 64; i++) store.ingest(fourAnchorMessage(`client-${i}`, sequence));
      sequence += 1;
    };
  });

  bench("full inbound path: bytes -> snapshot listener fired", () => {
    let fired = false;
    let subscriber: ((data: Uint8Array) => void) | null = null;
    const transport: LiveCursorTransport = {
      send: () => {},
      subscribe: (fn) => {
        subscriber = fn;
        return () => {
          subscriber = null;
        };
      },
    };

    const store = new RemotePresenceStore();
    const unsubscribeTransport = transport.subscribe((data) => {
      const decoded = jsonCodec.decode(data);
      const presence = validatePresence(decoded);
      if (presence === null) return;
      store.ingest(presence);
    });
    store.subscribe(() => {
      fired = true;
    });

    subscriber?.(encodedMessage);
    unsubscribeTransport();
    if (!fired) throw new Error("snapshot listener did not fire");
  });

  bench("getSnapshot() identity: 10k calls with no changes", () => {
    const store = new RemotePresenceStore();
    store.ingest(fourAnchorMessage("client-0", 0));
    store.getSnapshot();
    for (let i = 0; i < 10_000; i++) store.getSnapshot();
  });
});

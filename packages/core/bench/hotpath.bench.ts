// Hot-path benchmark cases, run by `bun run bench` (scripts/bench.ts). Not a vitest suite: vitest 5 dropped `bench`.

import type { Bench } from "tinybench";
import { binaryCodec } from "../src/binary-codec";
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
const encodedBinaryMessage = binaryCodec.encode(fourAnchorMessage("bench-client", 1));

/** Adds every hot-path case to `bench`, so one run produces one table. */
export function registerHotPathCases(bench: Bench): void {
  bench.add("validatePresence on a decoded 4-anchor message", () => {
    validatePresence(decodedMessage);
  });

  bench.add("jsonCodec.decode + validatePresence on encoded bytes", () => {
    const decoded = jsonCodec.decode(encodedMessage);
    validatePresence(decoded);
  });

  bench.add("binaryCodec.decode + validatePresence on encoded bytes", () => {
    const decoded = binaryCodec.decode(encodedBinaryMessage);
    validatePresence(decoded);
  });

  {
    const store = new RemotePresenceStore({ maxRemoteClients: 64 });
    for (let i = 0; i < 64; i++) store.ingest(fourAnchorMessage(`client-${i}`, 0));
    let sequence = 1;
    bench.add("store.ingest steady-state: 64 clients, sequential sequences", () => {
      for (let i = 0; i < 64; i++) store.ingest(fourAnchorMessage(`client-${i}`, sequence));
      sequence += 1;
    });
  }

  bench.add("binaryCodec full inbound path: bytes -> snapshot listener fired", () => {
    let fired = false;
    // a plain `let` here narrows to `never` at the read site under TS's closure flow analysis
    const subscriberBox: { current: ((data: Uint8Array) => void) | null } = { current: null };
    const transport: LiveCursorTransport = {
      send: () => {},
      subscribe: (fn) => {
        subscriberBox.current = fn;
        return () => {
          subscriberBox.current = null;
        };
      },
    };

    const store = new RemotePresenceStore();
    const unsubscribeTransport = transport.subscribe((data) => {
      const decoded = binaryCodec.decode(data);
      const presence = validatePresence(decoded);
      if (presence === null) return;
      store.ingest(presence);
    });
    store.subscribe(() => {
      fired = true;
    });

    subscriberBox.current?.(encodedBinaryMessage);
    unsubscribeTransport();
    if (!fired) throw new Error("snapshot listener did not fire");
  });

  bench.add("full inbound path: bytes -> snapshot listener fired", () => {
    let fired = false;
    const subscriberBox: { current: ((data: Uint8Array) => void) | null } = { current: null };
    const transport: LiveCursorTransport = {
      send: () => {},
      subscribe: (fn) => {
        subscriberBox.current = fn;
        return () => {
          subscriberBox.current = null;
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

    subscriberBox.current?.(encodedMessage);
    unsubscribeTransport();
    if (!fired) throw new Error("snapshot listener did not fire");
  });

  {
    const store = new RemotePresenceStore();
    store.ingest(fourAnchorMessage("client-0", 0));
    store.getSnapshot();
    bench.add("getSnapshot() identity: 10k calls with no changes", () => {
      for (let i = 0; i < 10_000; i++) store.getSnapshot();
    });
  }
}

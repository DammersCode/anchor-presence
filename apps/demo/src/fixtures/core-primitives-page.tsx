import { useEffect, useState } from "react";
import {
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  RemotePresenceStore,
  createEventChannel,
  createEventParser,
  createInMemoryPair,
  createPresenceClient,
  isDevMode,
  reportListenerError,
  validatePresence,
  warnOnce,
} from "@dammers/anchor-presence-core";
import type { PresenceMessage } from "@dammers/anchor-presence-core";

type Report = Record<string, string>;
type Events = { ping: number };

function presenceMessage(anchorId: string): PresenceMessage {
  return {
    version: 1,
    clientId: "remote-1",
    session: "session-1",
    sequence: 1,
    cursor: { anchors: [{ id: anchorId, u: 0.5, v: 0.5 }] },
  };
}

function runPair(): { send: () => void; read: () => Report; stop: () => void } {
  const pair = createInMemoryPair();
  const parseEvent = createEventParser<Events>({
    ping: (data) => (typeof data === "number" ? data : undefined),
  });
  const sender = createPresenceClient({ transport: pair.a, clientId: "pair-a" });
  const receiver = createPresenceClient({ transport: pair.b, clientId: "pair-b", parseEvent });
  let accepted = 0;
  createEventChannel<Events>(receiver).subscribe(() => accepted++);
  void pair.a.connect();
  void pair.b.connect();
  return {
    send() {
      sender.setLocalCursor({ anchors: [{ id: "box", u: 0.5, v: 0.5 }] });
      sender.sendEvent("ping", "not a number");
      sender.sendEvent("ping", 7);
    },
    read: () => ({
      "pair-remote-count": String(receiver.getRemoteSnapshot().length),
      "parser-accepted": String(accepted),
    }),
    stop() {
      sender.dispose();
      receiver.dispose();
      pair.dispose();
    },
  };
}

function runPure(): Report {
  const tooLong = "x".repeat(DEFAULT_MAX_ANCHOR_ID_LENGTH + 1);
  const store = new RemotePresenceStore();
  const warnKey = "core-primitives-" + Math.random();
  const valid = validatePresence(presenceMessage("box"));
  if (valid !== null) store.ingest(valid);

  const errors: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => errors.push(`error:${String(args[0])}`);
  console.warn = (...args: unknown[]) => errors.push(`warn:${String(args[0])}`);
  try {
    reportListenerError(new Error("boom"));
    warnOnce(warnKey, "shown once");
    warnOnce(warnKey, "shown once");
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  return {
    "validate-valid": valid === null ? "rejected" : "accepted",
    "validate-too-long": `${validatePresence(presenceMessage(tooLong))?.cursor?.anchors.length ?? "none"} anchors`,
    "store-count": String(store.getSnapshot().length),
    "dev-mode": String(isDevMode()),
    "listener-error": errors.some((line) => line.startsWith("error:[anchor-presence] a listener threw"))
      ? "reported"
      : "silent",
    "warn-once-count": String(errors.filter((line) => line.startsWith("warn:")).length),
  };
}

export function CorePrimitivesPage() {
  const [report, setReport] = useState<Report>({});

  useEffect(() => {
    const pure = runPure();
    const pair = runPair();
    pair.send();
    const refresh = () => setReport({ ...pure, ...pair.read() });
    refresh();
    const timer = setInterval(refresh, 100);
    return () => {
      clearInterval(timer);
      pair.stop();
    };
  }, []);

  return (
    <main>
      <h1>Core primitives</h1>
      <ul>
        {Object.entries(report).map(([key, value]) => (
          <li key={key}>
            {key}: <span data-testid={key}>{value}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

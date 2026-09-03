import { Profiler, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPresenceClient, jsonCodec } from "@anchor-presence/core";
import type { CursorPresence, LiveCursorTransport } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { useCursorPresence, useRemoteCursors } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function cursors(n: number): ResolvedCursor[] {
  return Array.from({ length: n }, (_, i) => ({
    clientId: `remote-${i}`,
    x: i,
    y: i,
    visible: true,
    anchorId: null,
    tier: "viewport" as const,
  }));
}

describe("react adapter perf contracts", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("100 snapshot publishes cause exactly 100 consumer renders and 0 sibling renders", () => {
    let siblingRenderCount = 0;
    let cursorRenderCount = 0;

    function Sibling() {
      siblingRenderCount += 1;
      return <div>sibling</div>;
    }
    function CursorReader() {
      cursorRenderCount += 1;
      const remote = useRemoteCursors();
      return <div>{remote.length}</div>;
    }

    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Sibling />
          <CursorReader />
        </LiveCursorProvider>,
      );
    });
    expect(cursorRenderCount).toBe(1);
    expect(siblingRenderCount).toBe(1);

    for (let i = 0; i < 100; i++) {
      act(() => {
        publish(cursors(1));
      });
    }

    expect(cursorRenderCount).toBe(101);
    expect(siblingRenderCount).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("publishing an unchanged snapshot reference causes 0 additional renders", () => {
    let cursorRenderCount = 0;
    function CursorReader() {
      cursorRenderCount += 1;
      const remote = useRemoteCursors();
      return <div>{remote.length}</div>;
    }

    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorReader />
        </LiveCursorProvider>,
      );
    });
    const sample = cursors(5);
    act(() => {
      publish(sample);
    });
    expect(cursorRenderCount).toBe(2);

    // useSyncExternalStore short-circuits: notifying with the SAME reference triggers no commit
    act(() => {
      publish(sample);
    });
    expect(cursorRenderCount).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it("mean commit duration for a 100-cursor list update stays under 10ms in jsdom", () => {
    function CursorList() {
      const remote = useRemoteCursors();
      return (
        <ul>
          {remote.map((c) => (
            <li key={c.clientId}>{c.clientId}</li>
          ))}
        </ul>
      );
    }

    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    const durations: number[] = [];
    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Profiler id="list" onRender={(_id, _phase, actualDuration) => durations.push(actualDuration)}>
            <CursorList />
          </Profiler>
        </LiveCursorProvider>,
      );
    });

    const ITERATIONS = 20;
    for (let i = 0; i < ITERATIONS; i++) {
      act(() => {
        publish(cursors(100));
      });
    }

    const updateDurations = durations.slice(1); // drop the initial mount commit
    const mean = updateDurations.reduce((sum, d) => sum + d, 0) / updateDurations.length;
    expect(mean).toBeLessThan(10);

    act(() => {
      root.unmount();
    });
  });

  it("mounting and unmounting the provider 50x leaves zero listeners on the binding", () => {
    const { client } = makeFakeClient();
    const { binding, listenerCount } = makeFakeBinding();

    function CursorReader() {
      useRemoteCursors();
      return null;
    }

    for (let i = 0; i < 50; i++) {
      const root = createRoot(container);
      act(() => {
        root.render(
          <LiveCursorProvider client={client} binding={binding}>
            <CursorReader />
          </LiveCursorProvider>,
        );
      });
      act(() => {
        root.unmount();
      });
    }

    expect(listenerCount()).toBe(0);
  });
});

// K2 baseline: a real PresenceClient (real store) behind a fake inbound transport.
function makeInboundChannel(): { transport: LiveCursorTransport; push: (presence: CursorPresence) => void } {
  const listeners = new Set<(data: Uint8Array) => void>();
  const transport: LiveCursorTransport = {
    send: () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    transport,
    push(presence: CursorPresence) {
      for (const listener of listeners) listener(jsonCodec.encode(presence));
    },
  };
}

function sameAnchorMessage(sequence: number, u = 0.5): CursorPresence {
  return {
    version: 1,
    clientId: "remote-1",
    session: "remote-session",
    sequence,
    cursor: { anchors: [{ id: "doc.body", u, v: 0.25 }] },
  };
}

describe("useCursorPresence inbound render cost (K2)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("100 inbound messages with unchanged visible content cause 1 consumer render", () => {
    let presenceRenderCount = 0;
    function PresenceReader() {
      presenceRenderCount += 1;
      const presence = useCursorPresence();
      return <div>{presence.length}</div>;
    }

    const { transport, push } = makeInboundChannel();
    const client = createPresenceClient({ transport, clientId: "local" });
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
          <PresenceReader />
        </LiveCursorProvider>,
      );
    });
    expect(presenceRenderCount).toBe(1);

    for (let i = 0; i < 100; i++) {
      act(() => {
        push(sameAnchorMessage(i));
      });
    }

    // all 100 accepted by the real store; only the first message (membership) is renderable
    expect(client.getRemoteSnapshot()).toHaveLength(1);
    expect(client.getRemoteSnapshot()[0]?.sequence).toBe(99);
    expect(presenceRenderCount).toBe(2);

    // a message that changes visible content rerenders; a following no-op does not
    act(() => {
      push(sameAnchorMessage(100, 0.75));
    });
    expect(presenceRenderCount).toBe(3);
    act(() => {
      push(sameAnchorMessage(101, 0.75));
    });
    expect(presenceRenderCount).toBe(3);
    expect(client.getRemoteSnapshot()[0]?.sequence).toBe(101);

    act(() => {
      client.dispose();
      root.unmount();
    });
  });
});

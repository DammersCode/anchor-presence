import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPresenceClient, jsonCodec } from "@anchor-presence/core";
import type { CursorPresence, LiveCursorTransport } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { useCursorPresence, useRemoteCursors } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./testUtils";

describe("rerender isolation", () => {
  let container: HTMLDivElement;
  let siblingRenderCount: number;
  let cursorRenderCount: number;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    siblingRenderCount = 0;
    cursorRenderCount = 0;
  });

  afterEach(() => {
    container.remove();
  });

  function Sibling() {
    siblingRenderCount += 1;
    return <div>sibling</div>;
  }

  function CursorReader() {
    cursorRenderCount += 1;
    const cursors = useRemoteCursors();
    return <div>{cursors.length}</div>;
  }

  it("a sibling not using cursor hooks does not rerender when cursor snapshots update", () => {
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

    expect(siblingRenderCount).toBe(1);
    expect(cursorRenderCount).toBe(1);

    const sample: ResolvedCursor[] = [{ clientId: "r1", x: 0, y: 0, visible: true, anchorId: null, tier: "viewport" }];
    act(() => {
      publish(sample);
    });

    expect(cursorRenderCount).toBe(2);
    expect(siblingRenderCount).toBe(1);

    act(() => {
      publish([...sample]);
    });

    expect(cursorRenderCount).toBe(3);
    expect(siblingRenderCount).toBe(1);

    act(() => {
      root.unmount();
    });
  });
});

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

function presenceMessage(sequence: number, u: number, context?: { page: string }): CursorPresence {
  const message: CursorPresence = {
    version: 1,
    clientId: "remote-1",
    session: "remote-session",
    sequence,
    cursor: { anchors: [{ id: "doc.body", u, v: 0.25 }] },
  };
  if (context !== undefined) message.context = context;
  return message;
}

describe("rerender isolation: presence store (stable snapshot)", () => {
  let container: HTMLDivElement;
  let presenceRenderCount: number;
  let siblingRenderCount: number;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    presenceRenderCount = 0;
    siblingRenderCount = 0;
  });

  afterEach(() => {
    container.remove();
  });

  function PresenceReader() {
    presenceRenderCount += 1;
    const presence = useCursorPresence();
    return <div>{presence.length}</div>;
  }

  function Sibling() {
    siblingRenderCount += 1;
    return <div>sibling</div>;
  }

  it("a presence consumer does not rerender on higher-sequence messages with unchanged content", () => {
    const { transport, push } = makeInboundChannel();
    const client = createPresenceClient({ transport, clientId: "local" });
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
          <Sibling />
          <PresenceReader />
        </LiveCursorProvider>,
      );
    });
    expect(presenceRenderCount).toBe(1);
    expect(siblingRenderCount).toBe(1);

    for (let i = 0; i < 50; i++) {
      act(() => {
        push(presenceMessage(i, 0.5));
      });
    }
    // only the first message (membership change) is renderable
    expect(presenceRenderCount).toBe(2);
    expect(siblingRenderCount).toBe(1);

    act(() => {
      push(presenceMessage(50, 0.75));
    });
    expect(presenceRenderCount).toBe(3); // visible content changed

    act(() => {
      push(presenceMessage(51, 0.75));
    });
    expect(presenceRenderCount).toBe(3); // higher sequence, unchanged content

    act(() => {
      push(presenceMessage(52, 0.75, { page: "orders" }));
    });
    expect(presenceRenderCount).toBe(4); // context changed

    act(() => {
      push(presenceMessage(53, 0.75));
    });
    expect(presenceRenderCount).toBe(4); // omitted context inherits, content unchanged

    // the store still tracks per-message sequence through the raw snapshot
    expect(client.getRemoteSnapshot()[0]?.sequence).toBe(53);

    act(() => {
      client.dispose();
      root.unmount();
    });
  });
});

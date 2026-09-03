import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPresenceClient } from "@anchor-presence/core";
import type { LiveCursorTransport } from "@anchor-presence/core";
import { LiveCursorProvider } from "../src/provider";
import { useRemoteUsers } from "../src/hooks";
import type { RemoteUser } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./testUtils";

type TestUser = { name: string };

function makePeerPair(): { transportA: LiveCursorTransport; transportB: LiveCursorTransport } {
  const aListeners = new Set<(data: Uint8Array) => void>();
  const bListeners = new Set<(data: Uint8Array) => void>();

  const transportA: LiveCursorTransport = {
    // 2-peer relay: each side's bytes go to the other peer's subscribers only
    send: (data) => {
      for (const listener of bListeners) listener(data);
    },
    subscribe: (listener) => {
      aListeners.add(listener);
      return () => aListeners.delete(listener);
    },
  };

  const transportB: LiveCursorTransport = {
    send: (data) => {
      for (const listener of aListeners) listener(data);
    },
    subscribe: (listener) => {
      bListeners.add(listener);
      return () => bListeners.delete(listener);
    },
  };

  return { transportA, transportB };
}

describe("useRemoteUsers", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("projects one entry per remote client with clientId, session, and user", () => {
    const { client, pushRemote } = makeFakeClient<unknown, TestUser>();
    const seen: RemoteUser<TestUser>[] = [];
    function Probe() {
      seen.push(useRemoteUsers<unknown, TestUser>());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
          <Probe />
        </LiveCursorProvider>,
      );
    });
    expect(seen.at(-1)).toEqual([]);

    act(() => {
      pushRemote([
        { version: 1, clientId: "a", session: "sa", sequence: 0, cursor: null, user: { name: "Ada" } },
        { version: 1, clientId: "b", session: "sb", sequence: 0, cursor: null },
      ]);
    });

    expect(seen.at(-1)).toEqual([
      { clientId: "a", user: { name: "Ada" }, session: "sa" },
      { clientId: "b", user: undefined, session: "sb" },
    ]);
    expect(seen.at(-1)?.[1]?.user).toBeUndefined();

    act(() => root.unmount());
  });

  it("shows a remote that arrives over the transport without a manual re-render", () => {
    vi.useFakeTimers();
    const { transportA, transportB } = makePeerPair();
    const clientA = createPresenceClient({ transport: transportA, clientId: "A" });
    const clientB = createPresenceClient({ transport: transportB, clientId: "B", publishIntervalMs: 50 });
    const seen: RemoteUser[] = [];
    function Probe() {
      const users = useRemoteUsers();
      seen.push(users);
      return <span data-testid="count">{users.length}</span>;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={clientA} binding={makeFakeBinding().binding}>
          <Probe />
        </LiveCursorProvider>,
      );
    });
    expect(container.querySelector("[data-testid=count]")?.textContent).toBe("0");

    act(() => {
      clientB.updateLocalCursor({ anchors: [] });
      vi.advanceTimersByTime(50);
    });

    expect(container.querySelector("[data-testid=count]")?.textContent).toBe("1");
    expect(seen.at(-1)).toEqual([{ clientId: "B", user: undefined, session: clientB.session }]);

    act(() => {
      clientB.dispose();
      clientA.dispose();
    });
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("returns an empty list without a provider (server snapshot)", () => {
    const seen: RemoteUser[] = [];
    function Probe() {
      seen.push(useRemoteUsers());
      return null;
    }
    renderToString(<Probe />);
    expect(seen).toEqual([[]]);
  });
});

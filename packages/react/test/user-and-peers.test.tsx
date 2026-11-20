import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { PeerChange } from "@anchor-presence/core";
import { useLocalUser as useUntypedLocalUser } from "../src/hooks/use-local-user";
import { createPresenceHooks } from "../src/typed-hooks";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

describe("useLocalUser, usePeerChanges and the typed event hooks", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("reads and sets the local user, reports peer changes and sends typed events", () => {
    const { client } = makeFakeClient<unknown, { name: string }, { reaction: { emoji: string } }>();
    let user: { name: string } | undefined = { name: "Ada" };
    const userListeners = new Set<() => void>();
    client.getUser = () => user;
    client.setUser = (next) => {
      user = next;
      for (const listener of userListeners) listener();
    };
    client.subscribeUser = (listener) => {
      userListeners.add(listener);
      return () => userListeners.delete(listener);
    };
    const peerListeners = new Set<(change: PeerChange<unknown, { name: string }>) => void>();
    client.subscribePeers = (listener) => {
      peerListeners.add(listener);
      return () => peerListeners.delete(listener);
    };
    const sent: unknown[][] = [];
    client.sendEvent = (type, data) => {
      sent.push([type, data]);
      return true;
    };

    const {
      PresenceProvider: TypedProvider,
      useLocalUser,
      usePeerChanges,
      useSendEvent,
    } = createPresenceHooks<unknown, { name: string }, { reaction: { emoji: string } }>();
    const seen: string[] = [];
    let setName: (name: string) => void = () => {};
    let send: ReturnType<typeof useSendEvent> = () => false;

    function Probe() {
      const [current, setCurrent] = useLocalUser();
      setName = (name) => setCurrent({ name });
      usePeerChanges((change) => seen.push(change.type + ":" + change.clientId));
      send = useSendEvent();
      seen.push("user:" + (current?.name ?? "none"));
      return null;
    }

    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <TypedProvider client={client} binding={makeFakeBinding<unknown, { name: string }>().binding}>
          <Probe />
        </TypedProvider>,
      ),
    );
    expect(seen.at(-1)).toBe("user:Ada");

    act(() => setName("Bo"));
    expect(seen.at(-1)).toBe("user:Bo");

    act(() => {
      for (const listener of peerListeners) listener({ type: "join", clientId: "p1" });
    });
    expect(seen).toContain("join:p1");

    expect(send("reaction", { emoji: "🎉" })).toBe(true);
    // @ts-expect-error the typed send rejects an unknown event type
    send("other");
    expect(sent[0]).toEqual(["reaction", { emoji: "🎉" }]);

    act(() => root.unmount());
    expect(peerListeners.size).toBe(0);
    expect(userListeners.size).toBe(0);
  });

  it("returns undefined and a no-op setter without a provider", () => {
    let result: ReturnType<typeof useUntypedLocalUser> | undefined;
    function Probe() {
      result = useUntypedLocalUser();
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(result?.[0]).toBeUndefined();
    expect(() => result?.[1]({ name: "x" })).not.toThrow();
    act(() => root.unmount());
  });
});

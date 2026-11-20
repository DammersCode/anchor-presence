import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { EventMap, TypedRemoteEvent } from "@dammers/anchor-presence-core";
import { PresenceProvider } from "../src/provider";
import { useRemoteEvents } from "../src/hooks/use-remote-events";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

describe("useRemoteEvents", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("subscribes once per client, calls the latest listener and unsubscribes on unmount", () => {
    const { client } = makeFakeClient();
    const handlers = new Set<(event: TypedRemoteEvent<EventMap>) => void>();
    client.subscribeEvents = (listener) => {
      handlers.add(listener);
      return () => handlers.delete(listener);
    };
    const seen: string[] = [];
    function Probe({ tag }: { tag: string }) {
      useRemoteEvents((event) => seen.push(`${tag}:${event.type}`));
      return null;
    }

    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const tree = (tag: string) => (
      <PresenceProvider client={client} binding={makeFakeBinding().binding}>
        <Probe tag={tag} />
      </PresenceProvider>
    );
    act(() => root.render(tree("a")));
    expect(handlers.size).toBe(1);

    act(() => root.render(tree("b")));
    expect(handlers.size).toBe(1);
    for (const handler of handlers) handler({ clientId: "p", type: "ping", data: undefined });
    expect(seen).toEqual(["b:ping"]);

    act(() => root.unmount());
    expect(handlers.size).toBe(0);
  });
});

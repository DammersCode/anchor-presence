import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteEvent } from "@anchor-presence/core";
import { LiveCursorProvider } from "../src/provider";
import { useCursorEvents } from "../src/hooks/use-cursor-events";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

describe("useCursorEvents", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("subscribes once per client, calls the latest listener and unsubscribes on unmount", () => {
    const { client } = makeFakeClient();
    const handlers = new Set<(event: RemoteEvent) => void>();
    client.subscribeEvents = (listener) => {
      handlers.add(listener);
      return () => handlers.delete(listener);
    };
    const seen: string[] = [];
    function Probe({ tag }: { tag: string }) {
      useCursorEvents((event) => seen.push(`${tag}:${event.type}`));
      return null;
    }

    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const tree = (tag: string) => (
      <LiveCursorProvider client={client} binding={makeFakeBinding().binding}>
        <Probe tag={tag} />
      </LiveCursorProvider>
    );
    act(() => root.render(tree("a")));
    expect(handlers.size).toBe(1);

    act(() => root.render(tree("b")));
    expect(handlers.size).toBe(1);
    for (const handler of handlers) handler({ clientId: "p", type: "ping" });
    expect(seen).toEqual(["b:ping"]);

    act(() => root.unmount());
    expect(handlers.size).toBe(0);
  });
});

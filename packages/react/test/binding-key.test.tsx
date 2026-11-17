import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LiveCursorContext } from "../src/context";
import { LiveCursorProvider } from "../src/provider";
import { makeFakeClient } from "./test-utils";

describe("LiveCursorProvider bindingKey", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it("rebuilds the binding when the key changes and keeps the same client", () => {
    const { client } = makeFakeClient();
    const bindings: unknown[] = [];
    const clients: unknown[] = [];
    function Probe() {
      const value = useContext(LiveCursorContext);
      bindings.push(value.binding);
      clients.push(value.client);
      return null;
    }
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (key: string) =>
      act(() =>
        root.render(
          <LiveCursorProvider client={client} bindingKey={key}>
            <Probe />
          </LiveCursorProvider>,
        ),
      );

    render("a");
    render("a");
    const first = bindings.at(-1);
    expect(first).not.toBeNull();

    render("b");
    const second = bindings.at(-1);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(new Set(clients.filter((value) => value !== null))).toEqual(new Set([client]));
    act(() => root.unmount());
  });
});

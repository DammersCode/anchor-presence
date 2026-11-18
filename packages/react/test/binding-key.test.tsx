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

describe("LiveCursorProvider local cursor on teardown", () => {
  it("keeps the local cursor when the binding is rebuilt and clears it on unmount", () => {
    const { client } = makeFakeClient();
    const updates: unknown[] = [];
    client.setLocalCursor = (cursor) => {
      updates.push(cursor);
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (key: string) =>
      act(() =>
        root.render(
          <LiveCursorProvider client={client} bindingKey={key}>
            {null}
          </LiveCursorProvider>,
        ),
      );

    render("a");
    render("b");
    expect(updates).toEqual([]);

    act(() => root.unmount());
    expect(updates).toEqual([null]);
    container.remove();
  });
});

describe("LiveCursorProvider clientKey", () => {
  it("disposes the old client and runs the factory again when the key changes", () => {
    const made: ReturnType<typeof makeFakeClient>[] = [];
    const disposed: boolean[] = [];
    const factory = () => {
      const fake = makeFakeClient();
      fake.client.registerTeardown(() => {
        disposed[made.indexOf(fake)] = true;
      });
      made.push(fake);
      return fake.client;
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (key: string) =>
      act(() =>
        root.render(
          <LiveCursorProvider factory={factory} clientKey={key}>
            {null}
          </LiveCursorProvider>,
        ),
      );

    render("room-a");
    render("room-a");
    expect(made).toHaveLength(1);

    render("room-b");
    expect(made).toHaveLength(2);
    expect(disposed[0]).toBe(true);
    act(() => root.unmount());
    container.remove();
  });
});

describe("useCursorBinding", () => {
  it("returns the binding of the provider, and null without one", async () => {
    const { useCursorBinding } = await import("../src/hooks/use-cursor-binding");
    const { client } = makeFakeClient();
    const { binding } = (await import("./test-utils")).makeFakeBinding();
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useCursorBinding());
      return null;
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    act(() =>
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Probe />
        </LiveCursorProvider>,
      ),
    );
    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe(binding);
    act(() => root.unmount());
    container.remove();
  });
});

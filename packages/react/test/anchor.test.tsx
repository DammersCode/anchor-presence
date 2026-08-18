import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveCursorProvider } from "../src/provider";
import { useCursorAnchor } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./testUtils";

function Anchored({ id }: { id: string }) {
  const ref = useCursorAnchor(id);
  return <div ref={ref} data-testid="anchor" />;
}

describe("useCursorAnchor lifecycle", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("registers on mount and unregisters on unmount", () => {
    const { client } = makeFakeClient();
    const { binding, registry } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Anchored id="a" />
        </LiveCursorProvider>,
      );
    });
    expect(registry.registrations.has("a")).toBe(true);

    act(() => {
      root.unmount();
    });
    expect(registry.registrations.has("a")).toBe(false);
  });

  it("re-registers when the element changes: unregisters old, registers new", () => {
    const { client } = makeFakeClient();
    const { binding, registry } = makeFakeBinding();
    const root = createRoot(container);

    function Toggle({ show }: { show: boolean }) {
      const ref = useCursorAnchor("a");
      return show ? <div ref={ref} /> : <span ref={ref} />;
    }

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Toggle show={true} />
        </LiveCursorProvider>,
      );
    });
    const firstElement = registry.registrations.get("a");
    expect(firstElement?.tagName).toBe("DIV");

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Toggle show={false} />
        </LiveCursorProvider>,
      );
    });
    const secondElement = registry.registrations.get("a");
    expect(secondElement?.tagName).toBe("SPAN");
    expect(secondElement).not.toBe(firstElement);

    act(() => {
      root.unmount();
    });
  });

  it("re-registers under the new id when the id prop changes", () => {
    const { client } = makeFakeClient();
    const { binding, registry } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Anchored id="a" />
        </LiveCursorProvider>,
      );
    });
    expect(registry.registrations.has("a")).toBe(true);
    expect(registry.registrations.has("b")).toBe(false);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Anchored id="b" />
        </LiveCursorProvider>,
      );
    });
    expect(registry.registrations.has("a")).toBe(false);
    expect(registry.registrations.has("b")).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("is a no-op ref callback when binding is null", () => {
    const { client } = makeFakeClient();
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(
          <LiveCursorProvider client={client}>
            <Anchored id="a" />
          </LiveCursorProvider>,
        );
      });
    }).not.toThrow();

    act(() => {
      root.unmount();
    });
  });

  it("StrictMode double-mount leaves exactly one live registration", () => {
    const { client } = makeFakeClient();
    const { binding, registry } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <React.StrictMode>
          <LiveCursorProvider client={client} binding={binding}>
            <Anchored id="a" />
          </LiveCursorProvider>
        </React.StrictMode>,
      );
    });

    expect(registry.registrations.size).toBe(1);
    expect(registry.registrations.has("a")).toBe(true);

    act(() => {
      root.unmount();
    });
    expect(registry.registrations.size).toBe(0);
  });
});

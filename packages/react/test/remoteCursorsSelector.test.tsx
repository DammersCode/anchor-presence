import { act, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { useRemoteCursorsSelector } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./testUtils";

function cursor(clientId: string, overrides: Partial<ResolvedCursor> = {}): ResolvedCursor {
  return { clientId, x: 1, y: 2, visible: true, pointVisible: true, anchorId: null, tier: "viewport", ...overrides };
}

const selectClientIds = (cursors: ResolvedCursor[]): string[] => cursors.map((c) => c.clientId);

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

describe("useRemoteCursorsSelector", () => {
  let container: HTMLDivElement;
  let renders: unknown[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    renders = [];
  });

  afterEach(() => {
    container.remove();
  });

  function CountReader() {
    const count = useRemoteCursorsSelector(useCallback((cursors: ResolvedCursor[]) => cursors.length, []));
    renders.push(count);
    return <div>{count}</div>;
  }

  function IdReader() {
    const ids = useRemoteCursorsSelector(selectClientIds, sameIds);
    renders.push(ids);
    return <div>{ids.join(",")}</div>;
  }

  it("returns the selected value and updates when it changes", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CountReader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toBe(0);

    act(() => {
      publish([cursor("r1"), cursor("r2")]);
    });
    expect(renders.at(-1)).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it("does not rerender when the selected value is unchanged", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CountReader />
        </LiveCursorProvider>,
      );
    });

    act(() => {
      publish([cursor("r1")]);
    });
    const afterFirst = renders.length;

    // a new snapshot array with the same cursor count: the selection is equal, so no rerender
    act(() => {
      publish([cursor("r1", { x: 99 })]);
    });

    expect(renders.length).toBe(afterFirst);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the previous reference when isEqual reports the selection unchanged", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <IdReader />
        </LiveCursorProvider>,
      );
    });

    act(() => {
      publish([cursor("r1")]);
    });
    const first = renders.at(-1);

    act(() => {
      publish([cursor("r1", { y: 42 })]);
    });

    expect(renders.at(-1)).toBe(first);

    act(() => {
      root.unmount();
    });
  });

  it("selects from an empty snapshot when no binding exists", () => {
    const { client } = makeFakeClient();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client}>
          <CountReader />
        </LiveCursorProvider>,
      );
    });

    expect(renders.at(-1)).toBe(0);
    expect(renders.length).toBeLessThan(10);

    act(() => {
      root.unmount();
    });
  });
});

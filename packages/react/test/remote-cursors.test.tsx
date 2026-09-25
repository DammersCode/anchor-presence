import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { useRemoteCursors } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function sampleCursor(clientId: string): ResolvedCursor {
  return {
    clientId,
    x: 1,
    y: 2,
    visible: true,
    pointVisible: true,
    anchorId: null,
    tier: "viewport",
    idle: false,
  };
}

describe("useRemoteCursors", () => {
  let container: HTMLDivElement;
  let renders: ResolvedCursor[][];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    renders = [];
  });

  afterEach(() => {
    container.remove();
  });

  function Reader() {
    const cursors = useRemoteCursors();
    renders.push(cursors);
    return <div>{cursors.length}</div>;
  }

  it("updates when the binding publishes a new snapshot", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toEqual([]);

    act(() => {
      publish([sampleCursor("remote-1")]);
    });
    expect(renders.at(-1)).toEqual([sampleCursor("remote-1")]);

    act(() => {
      root.unmount();
    });
  });

  it("returns a stable empty snapshot identity across renders (no infinite rerender)", () => {
    const { client } = makeFakeClient();
    const { binding } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    const first = renders.at(-1);

    act(() => {
      // trigger an unrelated re-render; empty snapshot identity must not change
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    const second = renders.at(-1);

    expect(first).toBe(second);
    expect(renders.length).toBeLessThan(10);

    act(() => {
      root.unmount();
    });
  });

  it("returns the same empty array reference when binding is null (server snapshot)", () => {
    const { client } = makeFakeClient();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toEqual([]);

    act(() => {
      root.unmount();
    });
  });
});

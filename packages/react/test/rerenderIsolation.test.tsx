import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { useRemoteCursors } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./testUtils";

describe("rerender isolation", () => {
  let container: HTMLDivElement;
  let siblingRenderCount: number;
  let cursorRenderCount: number;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
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

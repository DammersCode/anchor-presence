import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { LiveCursorProvider } from "../src/provider";
import { CursorLayer, DefaultCursor } from "../src/cursor";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function cursor(overrides: Partial<ResolvedCursor> = {}): ResolvedCursor {
  return {
    clientId: "r1",
    x: 10,
    y: 20,
    visible: true,
    pointVisible: true,
    anchorId: "nav.dashboard",
    tier: "anchor",
    ...overrides,
  };
}

function makeItemSpy(counts: Record<string, number>) {
  return function ItemSpy(props: { id: string }) {
    counts[props.id] = (counts[props.id] ?? 0) + 1;
    return <span>{props.id}</span>;
  };
}

describe("cursor components", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders a neutral SVG without a label by default", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor()]);
    });

    const el = container.querySelector("[data-anchor-presence-cursor]");
    expect(el).not.toBeNull();
    expect(el?.querySelector("svg")).not.toBeNull();
    expect(el?.textContent).toBe("");

    act(() => root.unmount());
  });

  it("applies getLabel and getColor to change the default visual", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer getLabel={() => "Ada"} getColor={() => "#ff0000"} />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor()]);
    });

    const el = container.querySelector("[data-anchor-presence-cursor]");
    expect(el?.textContent).toBe("Ada");
    expect(el?.innerHTML).toContain("#ff0000");

    act(() => root.unmount());
  });

  it("renderCursor replaces only the root contents", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer renderCursor={({ cursor: c }) => <span data-testid="custom">{c.clientId}</span>} />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor()]);
    });

    const el = container.querySelector("[data-anchor-presence-cursor]");
    expect(el?.querySelector("svg")).toBeNull();
    expect(el?.querySelector('[data-testid="custom"]')?.textContent).toBe("r1");
    // package root attributes still present around the custom content
    expect(el?.getAttribute("aria-hidden")).toBe("true");

    act(() => root.unmount());
  });

  it("consumer styles cannot replace package geometry", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer
            getCursorProps={() => ({
              style: {
                position: "absolute" as const,
                left: 999,
                top: 999,
                transform: "translate3d(0px, 0px, 0)",
                pointerEvents: "auto" as const,
              },
            })}
          />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor({ x: 42, y: 84 })]);
    });

    const el = container.querySelector("[data-anchor-presence-cursor]") as HTMLElement;
    expect(el.style.position).toBe("fixed");
    expect(el.style.left).toBe("0px");
    expect(el.style.top).toBe("0px");
    expect(el.style.pointerEvents).toBe("none");
    expect(el.style.transform).toBe("translate3d(42px, 84px, 0)");

    act(() => root.unmount());
  });

  it("consumer styles can replace zIndex", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer getCursorProps={() => ({ style: { zIndex: 999 } })} />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor()]);
    });

    const el = container.querySelector("[data-anchor-presence-cursor]") as HTMLElement;
    expect(el.style.zIndex).toBe("999");

    act(() => root.unmount());
  });

  it("getCursorProps adds a class and test attributes", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer
            getCursorProps={() => ({
              className: "demo-cursor",
              "data-testid": "remote-cursor",
              "data-cursor-name": "Ada",
            })}
          />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor()]);
    });

    const el = container.querySelector<HTMLElement>('[data-testid="remote-cursor"]');
    expect(el).not.toBeNull();
    expect(el?.className).toContain("demo-cursor");
    expect(el?.dataset.cursorName).toBe("Ada");

    act(() => root.unmount());
  });

  it("does not render hidden cursors", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor({ visible: false })]);
    });

    expect(container.querySelectorAll("[data-anchor-presence-cursor]").length).toBe(0);

    act(() => root.unmount());
  });

  it("filterCursor removes selected visible cursors", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer filterCursor={(c) => c.clientId !== "r2"} />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor({ clientId: "r1" }), cursor({ clientId: "r2" })]);
    });

    const ids = Array.from(container.querySelectorAll<HTMLElement>("[data-anchor-presence-client-id]")).map(
      (el) => el.dataset.anchorPresenceClientId,
    );
    expect(ids).toEqual(["r1"]);

    act(() => root.unmount());
  });

  it("renders an empty server snapshot with renderToString", () => {
    const html = renderToString(
      <LiveCursorProvider client={null}>
        <CursorLayer />
      </LiveCursorProvider>,
    );
    expect(html).not.toContain("data-anchor-presence-cursor");
  });

  it("cursor snapshot updates do not render a sibling component", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);
    let siblingRenderCount = 0;

    function Sibling() {
      siblingRenderCount += 1;
      return <div>sibling</div>;
    }

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Sibling />
          <CursorLayer />
        </LiveCursorProvider>,
      );
    });
    expect(siblingRenderCount).toBe(1);

    act(() => {
      publish([cursor()]);
    });
    expect(siblingRenderCount).toBe(1);

    act(() => root.unmount());
  });

  it("a moved cursor does not rerender the static cursor items", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);
    const counts: Record<string, number> = { r1: 0, r2: 0, r3: 0 };
    const ItemSpy = makeItemSpy(counts);
    const renderCursor = (props: { cursor: ResolvedCursor }) => <ItemSpy id={props.cursor.clientId} />;

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer renderCursor={renderCursor} />
        </LiveCursorProvider>,
      );
    });

    const r1 = cursor({ clientId: "r1" });
    const r2 = cursor({ clientId: "r2" });
    const r3 = cursor({ clientId: "r3" });
    act(() => {
      publish([r1, r2, r3]);
    });
    expect([counts.r1, counts.r2, counts.r3]).toEqual([1, 1, 1]);

    // r2 moves; r1 and r3 keep their object identity, as the resolver produces for unchanged cursors
    act(() => {
      publish([r1, { ...r2, x: 42, y: 42 }, r3]);
    });
    expect([counts.r1, counts.r2, counts.r3]).toEqual([1, 2, 1]);

    act(() => root.unmount());
  });

  it("does not run label and color callbacks for removed cursors", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);
    const seenIds: string[] = [];

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <CursorLayer
            filterCursor={(c) => c.clientId !== "r2"}
            getLabel={(c) => {
              seenIds.push(c.clientId);
              return c.clientId;
            }}
          />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      publish([cursor({ clientId: "r1" }), cursor({ clientId: "r2", visible: false })]);
    });

    expect(seenIds).toEqual(["r1"]);

    act(() => root.unmount());
  });
});

describe("DefaultCursor", () => {
  it("renders a pointer SVG and honors CSS variable precedence over color", () => {
    const html = renderToString(
      <DefaultCursor color="#ff0000" style={{ "--anchor-presence-cursor-color": "#00ff00" }} />,
    );
    expect(html).toContain("svg");
    expect(html).toContain("--anchor-presence-cursor-color:#00ff00");
  });
});

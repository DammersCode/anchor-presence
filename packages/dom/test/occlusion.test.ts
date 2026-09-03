import { beforeEach, describe, expect, it } from "vitest";
import { computeVisibleRect, isPointInRect, readClientRect } from "../src/occlusion";
import type { StyleValues } from "../src/occlusion";
import type { Rect } from "../src/geometry";
import type { SchedulerReadState } from "../src/scheduler";

const visible: StyleValues = { overflow: "visible", overflowX: "visible", overflowY: "visible" };

function reader(values: Map<Element, Rect>, getStyle: (element: Element) => StyleValues): SchedulerReadState {
  return {
    getRect: (element) => values.get(element),
    getClientRect: (element) => readClientRect(element, values.get(element)!),
    getStyle,
    viewportSize: { width: 1000, height: 800 },
  };
}

function setClientMetrics(element: Element, metrics: Record<string, number>): void {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

function clippedStyle(elements: Element[], values: StyleValues): (target: Element) => StyleValues {
  const clipped = new Set(elements);
  return (target) => (clipped.has(target) ? values : visible);
}

describe("computeVisibleRect", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("returns the full rect without clipping ancestors", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const rect = { left: 10, top: 20, width: 100, height: 50 };

    expect(computeVisibleRect(element, rect, reader(new Map(), () => visible))).toEqual(rect);
  });

  it("intersects an overflow:auto ancestor", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    const element = document.createElement("div");
    clip.append(element);
    const rect = { left: 10, top: 20, width: 100, height: 100 };
    const values = new Map<Element, Rect>([[clip, { left: 50, top: 40, width: 80, height: 60 }]]);

    expect(computeVisibleRect(element, rect, reader(values, clippedStyle([clip], {
      overflow: "auto", overflowX: "auto", overflowY: "auto",
    })))).toEqual({ left: 50, top: 40, width: 60, height: 60 });
  });

  it("uses the padding box when a clipping ancestor has thick borders", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    const element = document.createElement("div");
    clip.append(element);
    const values = new Map<Element, Rect>([[clip, { left: 0, top: 0, width: 100, height: 100 }]]);
    setClientMetrics(clip, {
      clientHeight: 80, clientLeft: 10, clientTop: 10, clientWidth: 80, offsetHeight: 100, offsetWidth: 100,
    });

    expect(computeVisibleRect(element, { left: 5, top: 5, width: 30, height: 30 }, reader(values, clippedStyle([clip], {
      overflow: "hidden", overflowX: "hidden", overflowY: "hidden",
    })))).toEqual({ left: 10, top: 10, width: 25, height: 25 });
  });

  it("uses scaled client metrics and excludes scrollbar space", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    const element = document.createElement("div");
    clip.append(element);
    const values = new Map<Element, Rect>([[clip, { left: 100, top: 50, width: 200, height: 100 }]]);
    setClientMetrics(clip, {
      clientHeight: 40, clientLeft: 10, clientTop: 5, clientWidth: 85, offsetHeight: 50, offsetWidth: 100,
    });

    expect(computeVisibleRect(element, { left: 280, top: 70, width: 30, height: 30 }, reader(values, clippedStyle([clip], {
      overflow: "auto", overflowX: "auto", overflowY: "auto",
    })))).toEqual({ left: 280, top: 70, width: 10, height: 30 });
  });

  it("falls back to the bounding rect without client metrics", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = { left: 10, top: 20, width: 30, height: 40 };

    expect(readClientRect(svg, rect)).toEqual(rect);
  });

  it("returns null when an overflow ancestor clips the element completely", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    const element = document.createElement("div");
    clip.append(element);
    const values = new Map<Element, Rect>([[clip, { left: 200, top: 200, width: 20, height: 20 }]]);

    expect(computeVisibleRect(element, { left: 10, top: 20, width: 100, height: 100 }, reader(values, clippedStyle([clip], {
      overflow: "hidden", overflowX: "hidden", overflowY: "hidden",
    })))).toBeNull();
  });

  it("marks a point beyond a scroll container's visible sub-rect as invisible", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    const element = document.createElement("button");
    clip.append(element);
    const values = new Map<Element, Rect>([[clip, { left: 0, top: 0, width: 200, height: 80 }]]);
    const visibleRect = computeVisibleRect(
      element,
      { left: 120, top: 60, width: 40, height: 40 },
      reader(values, clippedStyle([clip], { overflow: "auto", overflowX: "auto", overflowY: "auto" })),
    );

    expect(isPointInRect(140, 90, visibleRect)).toBe(false);
  });

  it("intersects nested clipping ancestors", () => {
    const outer = document.createElement("div");
    document.body.append(outer);
    const inner = document.createElement("div");
    outer.append(inner);
    const element = document.createElement("div");
    inner.append(element);
    const values = new Map<Element, Rect>([
      [inner, { left: 20, top: 20, width: 100, height: 100 }],
      [outer, { left: 50, top: 40, width: 60, height: 60 }],
    ]);

    expect(computeVisibleRect(element, { left: 0, top: 0, width: 200, height: 200 }, reader(values, clippedStyle([inner, outer], {
      overflow: "clip", overflowX: "clip", overflowY: "clip",
    })))).toEqual({ left: 50, top: 40, width: 60, height: 60 });
  });

  it("ignores overflow:visible ancestors", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const element = document.createElement("div");
    parent.append(element);
    const rect = { left: 10, top: 20, width: 100, height: 50 };
    const values = new Map<Element, Rect>([[parent, { left: 30, top: 40, width: 20, height: 10 }]]);

    expect(computeVisibleRect(element, rect, reader(values, () => visible))).toEqual(rect);
  });

  it("uses an element's owner document for an isolated document", () => {
    const isolated = document.implementation.createHTMLDocument("isolated");
    const clip = isolated.createElement("div");
    isolated.body.append(clip);
    const element = isolated.createElement("div");
    clip.append(element);
    const values = new Map<Element, Rect>([[clip, { left: 10, top: 10, width: 20, height: 20 }]]);

    expect(computeVisibleRect(element, { left: 0, top: 0, width: 40, height: 40 }, reader(values, clippedStyle([clip], {
      overflow: "hidden", overflowX: "hidden", overflowY: "hidden",
    })))).toEqual({ left: 10, top: 10, width: 20, height: 20 });
  });

  it("treats a null visible rect as outside", () => {
    expect(isPointInRect(0, 0, null)).toBe(false);
  });
});

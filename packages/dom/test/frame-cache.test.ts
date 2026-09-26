import { describe, expect, it, vi } from "vitest";
import { createFrameCache } from "../src/frame-cache";
import type { StyleValues } from "../src/occlusion";

const styleStub: StyleValues = { overflow: "visible", overflowX: "visible", overflowY: "visible" };

function makeHost(width = 800, height = 600) {
  return {
    window: { innerWidth: width, innerHeight: height } as Window,
    getStyle: () => styleStub,
  };
}

function makeElement(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  const spy = vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  });
  return { el, spy };
}

describe("createFrameCache", () => {
  it("measure() pre-measures each anchor exactly once and memoizes later reads", () => {
    const { el, spy } = makeElement({ left: 10, top: 20, width: 100, height: 50 });
    const cache = createFrameCache(makeHost());

    const state = cache.measure([el]);
    expect(spy).toHaveBeenCalledTimes(1);

    expect(state.getRect(el)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
    state.getClientRect(el);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("measures a non-anchor element lazily on first getRect, then serves the cached rect", () => {
    const { el, spy } = makeElement({ left: 0, top: 0, width: 10, height: 10 });
    const cache = createFrameCache(makeHost());

    const state = cache.measure([]);
    expect(spy).not.toHaveBeenCalled();
    state.getRect(el);
    state.getRect(el);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reuse() serves the previous frame without re-measuring; null before any measure", () => {
    const cache = createFrameCache(makeHost());
    expect(cache.reuse()).toBeNull();

    const { el, spy } = makeElement({ left: 0, top: 0, width: 10, height: 10 });
    const state = cache.measure([el]);

    const reused = cache.reuse();
    expect(reused).toBe(state);
    reused?.getRect(el);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clear() drops the frame: reuse() is null, getCachedRect is undefined, next measure re-reads", () => {
    const { el, spy } = makeElement({ left: 0, top: 0, width: 10, height: 10 });
    const cache = createFrameCache(makeHost());

    cache.measure([el]);
    expect(cache.getCachedRect(el)).toBeDefined();

    cache.clear();
    expect(cache.reuse()).toBeNull();
    expect(cache.getCachedRect(el)).toBeUndefined();

    cache.measure([el]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("getCachedRect returns measured rects only", () => {
    const measured = makeElement({ left: 1, top: 2, width: 3, height: 4 });
    const other = makeElement({ left: 5, top: 6, width: 7, height: 8 });
    const cache = createFrameCache(makeHost());

    cache.measure([measured.el]);
    expect(cache.getCachedRect(measured.el)).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    expect(cache.getCachedRect(other.el)).toBeUndefined();
  });

  it("D-6: getStyle is memoized per element per frame; a new frame re-reads", () => {
    const { el } = makeElement({ left: 0, top: 0, width: 10, height: 10 });
    const getStyle = vi.fn(() => styleStub);
    const cache = createFrameCache({ window: makeHost().window, getStyle });

    const state = cache.measure([]);
    state.getStyle(el);
    state.getStyle(el);
    expect(getStyle).toHaveBeenCalledTimes(1);

    cache.reuse()?.getStyle(el);
    expect(getStyle).toHaveBeenCalledTimes(1); // reused frame serves the memoized style

    cache.measure([]).getStyle(el);
    expect(getStyle).toHaveBeenCalledTimes(2);
  });

  it("viewportSize is read from the host window at measure time", () => {
    const host = makeHost(1024, 768);
    const cache = createFrameCache(host);
    expect(cache.measure([]).viewportSize).toEqual({ width: 1024, height: 768 });
  });
});

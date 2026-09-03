// Per-frame geometry cache for the scheduler's READ phase — spec §11

import type { Rect } from "./geometry";
import { readClientRect } from "./occlusion";
import type { StyleValues } from "./occlusion";
import type { SchedulerReadState } from "./scheduler";

export type FrameCacheHost = {
  window: Window;
  getStyle(element: Element): StyleValues;
};

/**
 * Holds one frame's rects and viewport size, and serves them as a `SchedulerReadState`.
 *
 * `measure()` starts a fresh frame; `reuse()` serves the previous frame again for an
 * interpolation-only pass. `clear()` drops everything, so the next call — including the
 * final pass after the scheduler detaches — must re-measure.
 */
export type FrameCache = {
  measure(anchors: Iterable<Element>): SchedulerReadState;
  reuse(): SchedulerReadState | null;
  clear(): void;
  getCachedRect(element: Element): Rect | undefined;
};

function measureRect(element: Element): Rect {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function createFrameCache(host: FrameCacheHost): FrameCache {
  let frame: { readState: SchedulerReadState; rects: Map<Element, Rect> } | null = null;

  function startFrame(): SchedulerReadState {
    const rects = new Map<Element, Rect>();
    const clientRects = new Map<Element, Rect>();
    const styles = new Map<Element, StyleValues>();
    function rectOf(element: Element): Rect {
      let rect = rects.get(element);
      if (rect === undefined) {
        rect = measureRect(element);
        rects.set(element, rect);
      }
      return rect;
    }
    const readState: SchedulerReadState = {
      getRect: rectOf,
      getClientRect(element) {
        let rect = clientRects.get(element);
        if (rect === undefined) {
          rect = readClientRect(element, rectOf(element));
          clientRects.set(element, rect);
        }
        return rect;
      },
      getStyle(element) {
        let style = styles.get(element);
        if (style === undefined) {
          style = host.getStyle(element);
          styles.set(element, style);
        }
        return style;
      },
      viewportSize: { width: host.window.innerWidth, height: host.window.innerHeight },
    };
    frame = { readState, rects };
    return readState;
  }

  return {
    measure(anchors) {
      const readState = startFrame();
      // pre-measure every candidate anchor once, before any compute or consumer code runs
      for (const element of anchors) readState.getClientRect(element);
      return readState;
    },

    reuse() {
      return frame?.readState ?? null;
    },

    clear() {
      frame = null;
    },

    getCachedRect(element) {
      return frame?.rects.get(element);
    },
  };
}

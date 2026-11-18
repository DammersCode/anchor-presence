// Geometry scheduler — spec §11

import type { Rect, ViewportSize } from "./geometry.js";
import type { StyleValues } from "./occlusion.js";
import { isDevMode } from "@anchor-presence/core";
import { createFrameCache } from "./frame-cache.js";
import { createSignalHub } from "./internal/signals.js";

/** The part of `ResizeObserver` the scheduler uses; pass a fake in tests. */
export type ResizeObserverLike = {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
};
/** Constructor of a `ResizeObserverLike`. */
export type ResizeObserverCtor = new (callback: () => void) => ResizeObserverLike;

/** The part of `MutationObserver` the scheduler uses; pass a fake in tests. */
export type MutationObserverLike = {
  observe(target: Node, options: MutationObserverInit): void;
  unobserve?(target: Node): void;
  disconnect(): void;
};
/** Constructor of a `MutationObserverLike`. */
export type MutationObserverCtor = new (
  callback: (records?: MutationRecord[]) => void,
) => MutationObserverLike;

/** Replaces `requestAnimationFrame`. */
export type RafLike = (callback: (timestampMs: number) => void) => number;
/** Replaces `cancelAnimationFrame`. */
export type CafLike = (handle: number) => void;
/** Replaces `setTimeout`. */
export type SetTimeoutLike = (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
/** Replaces `clearTimeout`. */
export type ClearTimeoutLike = (handle: ReturnType<typeof setTimeout>) => void;

/**
 * The attribute that marks a rendered remote cursor element.
 * The React adapter sets it on each cursor root.
 */
export const CURSOR_MARKER_ATTRIBUTE = "data-anchor-presence-cursor";

/** Result of one READ+COMPUTE+NOTIFY pass, handed back to the caller-supplied compute function. */
export type SchedulerReadState = {
  getRect(element: Element): Rect | undefined;
  getClientRect(element: Element): Rect;
  getStyle(element: Element): StyleValues;
  viewportSize: ViewportSize;
};

export type ComputeResult<TSnapshot> = {
  snapshot: TSnapshot;
  activeAnchors: Element[];
  needsAnotherFrame: boolean;
};

export type GeometrySchedulerOptions<TSnapshot> = {
  hasActiveCursors(): boolean;
  compute(state: SchedulerReadState, timestampMs: number): ComputeResult<TSnapshot>;
  notify(snapshot: TSnapshot): void;
  onRegistryChange(listener: () => void): () => void;
  onRemoteData(listener: () => void): () => void;
  onMutationRecords?(records?: MutationRecord[]): void;
  onAttach?(): void;
  onDetach?(): void;

  root?: Document | undefined;
  window?: Window | undefined;
  raf?: RafLike | undefined;
  caf?: CafLike | undefined;
  setTimeout?: SetTimeoutLike | undefined;
  clearTimeout?: ClearTimeoutLike | undefined;
  ResizeObserverCtor?: ResizeObserverCtor | undefined;
  MutationObserverCtor?: MutationObserverCtor | undefined;
};

export type GeometryScheduler = {
  invalidate(reason?: string): void;
  getCachedRect(element: Element): Rect | undefined;
  dispose(): void;
};

export function createGeometryScheduler<TSnapshot>(
  options: GeometrySchedulerOptions<TSnapshot>,
): GeometryScheduler {
  const doc = options.root ?? document;
  const win = options.window ?? window;
  const raf: RafLike = options.raf ?? ((cb) => win.requestAnimationFrame(cb));
  const caf: CafLike = options.caf ?? ((handle) => win.cancelAnimationFrame(handle));
  const setTimer: SetTimeoutLike = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer: ClearTimeoutLike = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  const ResizeObserverImpl =
    options.ResizeObserverCtor ?? (win as unknown as { ResizeObserver?: ResizeObserverCtor }).ResizeObserver;
  const MutationObserverImpl =
    options.MutationObserverCtor ??
    (win as unknown as { MutationObserver?: MutationObserverCtor }).MutationObserver;

  let disposed = false;
  let attached = false;
  let rafHandle: number | null = null;
  let dirty = false;

  const frameCache = createFrameCache({
    window: win,
    getStyle: (element) => (element.ownerDocument.defaultView ?? win).getComputedStyle(element),
  });

  const signals = createSignalHub({
    doc,
    win,
    setTimer,
    clearTimer,
    markerAttribute: CURSOR_MARKER_ATTRIBUTE,
    ResizeObserverCtor: ResizeObserverImpl,
    MutationObserverCtor: MutationObserverImpl,
    onInvalidate: markDirtyAndSchedule,
    onMutationRecords: (records) => options.onMutationRecords?.(records),
  });

  function scheduleFrame(): void {
    if (disposed || rafHandle !== null || !attached) return;
    rafHandle = raf((ts) => runPass(ts));
  }

  function markDirtyAndSchedule(): void {
    dirty = true;
    if (attached) scheduleFrame();
  }

  function runPass(timestampMs: number): void {
    rafHandle = null;
    // an invalidation arrived, or a transition window is open: re-measure (spec §11/§13)
    const shouldRemeasure = dirty || signals.hasOpenTransitions();
    dirty = false;

    // interpolation-only pass: reuse the last read phase's rects, no re-measure
    const readState = (shouldRemeasure ? null : frameCache.reuse()) ?? frameCache.measure(signals.anchors());

    let result: ComputeResult<TSnapshot>;
    try {
      result = options.compute(readState, timestampMs);
    } catch (error) {
      // a throwing policy or interpolator must not kill the frame loop: keep the last snapshot, retry on the next change
      if (isDevMode())
        console.error("[anchor-presence] cursor resolution threw; keeping the last snapshot", error);
      return;
    }
    signals.syncAnchors(result.activeAnchors);
    options.notify(result.snapshot);

    if (result.needsAnotherFrame || dirty || signals.hasOpenTransitions()) {
      scheduleFrame();
    }
  }

  function attach(): void {
    if (attached || disposed) return;
    attached = true;
    signals.attach();
    scheduleFrame();
    options.onAttach?.();
  }

  function detach(): void {
    if (!attached) return;
    attached = false;
    signals.detach();
    if (rafHandle !== null) {
      caf(rafHandle);
      rafHandle = null;
    }
    dirty = false;
    frameCache.clear();
    options.onDetach?.();
  }

  function syncActivation(): void {
    if (disposed) return;
    const shouldBeActive = options.hasActiveCursors();
    if (shouldBeActive && !attached) attach();
    else if (!shouldBeActive && attached) {
      detach();
      // final pass so consumers see cursors leave before the signals go quiet
      runPass(typeof performance !== "undefined" ? performance.now() : Date.now());
    }
  }

  // these two listeners stay subscribed even while idle: they're what wakes the scheduler up
  const unsubRemoteData = options.onRemoteData(() => {
    syncActivation();
    if (attached) markDirtyAndSchedule();
  });
  const unsubRegistryChange = options.onRegistryChange(() => {
    syncActivation();
    if (attached) markDirtyAndSchedule();
  });
  syncActivation();

  return {
    invalidate(_reason) {
      if (disposed) return;
      syncActivation();
      if (attached) markDirtyAndSchedule();
    },

    getCachedRect(element) {
      // while dirty the rect is at most one frame stale; the scheduler's own rAF tick re-measures, so
      // serving it keeps the pointer path off live getBoundingClientRect (spec §9 tolerance)
      return frameCache.getCachedRect(element);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      unsubRemoteData();
      unsubRegistryChange();
    },
  };
}

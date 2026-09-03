// Geometry scheduler — spec §11

import type { Rect, ViewportSize } from "./geometry";
import type { StyleValues } from "./occlusion";
import { createFrameCache } from "./frameCache";

export type ResizeObserverLike = {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
};
export type ResizeObserverCtor = new (callback: () => void) => ResizeObserverLike;

export type MutationObserverLike = {
  observe(target: Node, options: MutationObserverInit): void;
  unobserve?(target: Node): void;
  disconnect(): void;
};
export type MutationObserverCtor = new (
  callback: (records?: MutationRecord[]) => void,
) => MutationObserverLike;

export type RafLike = (callback: (timestampMs: number) => void) => number;
export type CafLike = (handle: number) => void;
export type SetTimeoutLike = (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
export type ClearTimeoutLike = (handle: ReturnType<typeof setTimeout>) => void;

// cross-package DOM contract: marks a rendered cursor root element (the react adapter sets it)
export const CURSOR_MARKER_ATTRIBUTE = "data-anchor-presence-cursor";

const TRANSITION_START_EVENTS = ["transitionrun", "animationstart"] as const;
const TRANSITION_END_EVENTS = ["transitionend", "transitioncancel", "animationend", "animationcancel"] as const;

const SAFETY_TIMEOUT_CAP_MS = 10_000;
const INFINITE_ANIMATION_WINDOW_MS = 500;
const CANCEL_SAFETY_MARGIN_MS = 500;

const MUTATION_OBSERVE_OPTIONS: MutationObserverInit = { childList: true, attributes: true, subtree: true };

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

// document-level scroll/mutation signals stop at shadow boundaries; observe each anchor's roots directly
function collectShadowRoots(anchors: Iterable<Element>): Set<ShadowRoot> {
  const roots = new Set<ShadowRoot>();
  for (const el of anchors) {
    let root = el.getRootNode();
    while (root instanceof ShadowRoot) {
      roots.add(root);
      root = root.host.getRootNode();
    }
  }
  return roots;
}

// own cursor renders mutate the DOM every frame; reacting to them would defeat the interpolation-only reuse path
function isCursorRootMutation(record: MutationRecord): boolean {
  const target = record.target;
  const element = target instanceof Element ? target : target.parentElement;
  return element !== null && element.closest(`[${CURSOR_MARKER_ATTRIBUTE}]`) !== null;
}

function parseCssTimeList(value: string): number[] {
  return value
    .split(",")
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- Number("0.3s") is NaN; parseFloat reads the leading number
    .map((v) => Number.parseFloat(v))
    .map((n) => (Number.isFinite(n) ? n * 1000 : 0));
}

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
    options.MutationObserverCtor ?? (win as unknown as { MutationObserver?: MutationObserverCtor }).MutationObserver;

  let disposed = false;
  let attached = false;
  let rafHandle: number | null = null;
  let dirty = false;

  let observedAnchors = new Set<Element>();
  let resizeObserver: ResizeObserverLike | null = null;
  let mutationObserver: MutationObserverLike | null = null;
  const shadowRootObservers = new Map<ShadowRoot, MutationObserverLike | null>();

  // per-target keying: distinct elements with the same property/animation name must not collide (spec §11)
  const transitionEntries = new Map<EventTarget, Map<string, { safetyTimer: ReturnType<typeof setTimeout> }>>();
  let openTransitionCount = 0;

  const frameCache = createFrameCache({
    window: win,
    getStyle: (element) => (element.ownerDocument.defaultView ?? win).getComputedStyle(element),
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
    const shouldRemeasure = dirty || openTransitionCount > 0;
    dirty = false;

    // interpolation-only pass: reuse the last read phase's rects, no re-measure
    const readState = (shouldRemeasure ? null : frameCache.reuse()) ?? frameCache.measure(observedAnchors);

    const result = options.compute(readState, timestampMs);
    syncObservedAnchors(result.activeAnchors);
    options.notify(result.snapshot);

    if (result.needsAnotherFrame || dirty || openTransitionCount > 0) {
      scheduleFrame();
    }
  }

  function syncObservedAnchors(next: Element[]): void {
    const nextSet = new Set(next);
    if (resizeObserver !== null) {
      for (const el of observedAnchors) {
        if (!nextSet.has(el)) resizeObserver.unobserve(el);
      }
      for (const el of nextSet) {
        if (!observedAnchors.has(el)) resizeObserver.observe(el);
      }
    }
    observedAnchors = nextSet;
    syncShadowRoots(nextSet);
  }

  function syncShadowRoots(anchors: Iterable<Element>): void {
    const next = collectShadowRoots(anchors);
    for (const [root, observer] of shadowRootObservers) {
      if (next.has(root)) continue;
      root.removeEventListener("scroll", onDocumentScroll, { capture: true });
      observer?.disconnect();
      shadowRootObservers.delete(root);
    }
    for (const root of next) {
      if (shadowRootObservers.has(root)) continue;
      root.addEventListener("scroll", onDocumentScroll, { capture: true, passive: true });
      let observer: MutationObserverLike | null = null;
      if (MutationObserverImpl) {
        observer = new MutationObserverImpl(onMutation);
        observer.observe(root, MUTATION_OBSERVE_OPTIONS);
      }
      shadowRootObservers.set(root, observer);
    }
  }

  function onWindowResize(): void {
    markDirtyAndSchedule();
  }
  function onDocumentScroll(): void {
    markDirtyAndSchedule();
  }
  function onResizeObserverEntry(): void {
    markDirtyAndSchedule();
  }
  function onMutation(records?: MutationRecord[]): void {
    if (records === undefined) {
      options.onMutationRecords?.(records);
      markDirtyAndSchedule();
      return;
    }

    let hasRelevantRecord = false;
    for (const record of records) {
      if (!isCursorRootMutation(record)) {
        hasRelevantRecord = true;
        break;
      }
    }

    if (hasRelevantRecord) {
      options.onMutationRecords?.(records);
      markDirtyAndSchedule();
    }
  }

  function closeTransitionEntry(target: EventTarget | null, name: string): void {
    if (target === null) return;
    const byName = transitionEntries.get(target);
    const entry = byName?.get(name);
    if (byName === undefined || entry === undefined) return;
    clearTimer(entry.safetyTimer);
    byName.delete(name);
    if (byName.size === 0) transitionEntries.delete(target);
    openTransitionCount -= 1;
  }

  function readTimingMs(target: Element, isAnimation: boolean): number {
    try {
      const style = win.getComputedStyle(target);
      const durationProp = isAnimation ? "animation-duration" : "transition-duration";
      const delayProp = isAnimation ? "animation-delay" : "transition-delay";
      const duration = Math.max(...parseCssTimeList(style.getPropertyValue(durationProp)), 0);
      const delay = Math.max(...parseCssTimeList(style.getPropertyValue(delayProp)), 0);
      return duration + delay;
    } catch {
      return 0;
    }
  }

  function isInfiniteIterationAnimation(target: Element): boolean {
    try {
      const iterationCount = win.getComputedStyle(target).getPropertyValue("animation-iteration-count");
      return iterationCount.split(",").some((v) => v.trim() === "infinite");
    } catch {
      return false;
    }
  }

  function onTransitionStart(event: Event): void {
    const isAnimation = event.type === "animationstart";
    const name = isAnimation ? (event as AnimationEvent).animationName : (event as TransitionEvent).propertyName;
    const target = event.target;
    if (target === null) return;
    closeTransitionEntry(target, name ?? "");

    let windowMs: number;
    if (isAnimation && target instanceof Element && isInfiniteIterationAnimation(target)) {
      // infinite-iteration animations get one short window instead of a tracked entry — spinners cannot pin the rAF loop
      windowMs = INFINITE_ANIMATION_WINDOW_MS;
    } else {
      const timingMs = target instanceof Element ? readTimingMs(target, isAnimation) : 0;
      windowMs = Math.min(timingMs + CANCEL_SAFETY_MARGIN_MS, SAFETY_TIMEOUT_CAP_MS);
    }

    const safetyTimer = setTimer(() => {
      closeTransitionEntry(target, name ?? "");
      markDirtyAndSchedule();
    }, windowMs);
    let byName = transitionEntries.get(target);
    if (byName === undefined) {
      byName = new Map();
      transitionEntries.set(target, byName);
    }
    byName.set(name ?? "", { safetyTimer });
    openTransitionCount += 1;
    markDirtyAndSchedule();
  }

  function onTransitionEnd(event: Event): void {
    const isAnimation = event.type.startsWith("animation");
    const name = isAnimation ? (event as AnimationEvent).animationName : (event as TransitionEvent).propertyName;
    closeTransitionEntry(event.target, name ?? "");
    markDirtyAndSchedule();
  }

  function attach(): void {
    if (attached || disposed) return;
    attached = true;

    win.addEventListener("resize", onWindowResize);
    doc.addEventListener("scroll", onDocumentScroll, { capture: true, passive: true });

    if (ResizeObserverImpl) {
      resizeObserver = new ResizeObserverImpl(onResizeObserverEntry);
      resizeObserver.observe(doc.documentElement);
    }

    // body can still be null when attach runs from a <head> script; documentElement covers the later body subtree
    const mutationTarget: Node | null = doc.body ?? doc.documentElement;
    if (MutationObserverImpl && mutationTarget !== null) {
      mutationObserver = new MutationObserverImpl(onMutation);
      mutationObserver.observe(mutationTarget, MUTATION_OBSERVE_OPTIONS);
    }

    for (const type of TRANSITION_START_EVENTS) {
      doc.addEventListener(type, onTransitionStart, { capture: true });
    }
    for (const type of TRANSITION_END_EVENTS) {
      doc.addEventListener(type, onTransitionEnd, { capture: true });
    }

    scheduleFrame();
    options.onAttach?.();
  }

  function detach(): void {
    if (!attached) return;
    attached = false;

    win.removeEventListener("resize", onWindowResize);
    doc.removeEventListener("scroll", onDocumentScroll, { capture: true });

    if (resizeObserver !== null) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    observedAnchors = new Set();

    if (mutationObserver !== null) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    for (const [root, observer] of shadowRootObservers) {
      root.removeEventListener("scroll", onDocumentScroll, { capture: true });
      observer?.disconnect();
    }
    shadowRootObservers.clear();

    for (const type of TRANSITION_START_EVENTS) {
      doc.removeEventListener(type, onTransitionStart, { capture: true });
    }
    for (const type of TRANSITION_END_EVENTS) {
      doc.removeEventListener(type, onTransitionEnd, { capture: true });
    }
    for (const [target, byName] of Array.from(transitionEntries)) {
      for (const name of Array.from(byName.keys())) closeTransitionEntry(target, name);
    }

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
      // a dirty flag means a layout-changing signal arrived after the last measure; the cache is not trustworthy
      return dirty ? undefined : frameCache.getCachedRect(element);
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

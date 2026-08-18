// Geometry scheduler — spec §11

export type Rect = { left: number; top: number; width: number; height: number };
export type ViewportSize = { width: number; height: number };

export type ResizeObserverLike = {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
};
export type ResizeObserverCtor = new (callback: () => void) => ResizeObserverLike;

export type MutationObserverLike = {
  observe(target: Node, options: MutationObserverInit): void;
  disconnect(): void;
};
export type MutationObserverCtor = new (callback: () => void) => MutationObserverLike;

export type RafLike = (callback: (timestampMs: number) => void) => number;
export type CafLike = (handle: number) => void;

const TRANSITION_START_EVENTS = ["transitionrun", "animationstart"] as const;
const TRANSITION_END_EVENTS = ["transitionend", "transitioncancel", "animationend", "animationcancel"] as const;

const SAFETY_TIMEOUT_CAP_MS = 10_000;
const INFINITE_ANIMATION_WINDOW_MS = 500;
const CANCEL_SAFETY_MARGIN_MS = 500;

/** Result of one READ+COMPUTE+NOTIFY pass, handed back to the caller-supplied compute function. */
export type SchedulerReadState = {
  getRect(element: Element): Rect | undefined;
  viewportSize: ViewportSize;
};

export type ComputeResult<TSnapshot> = {
  snapshot: TSnapshot;
  /** Anchors that should be measured (and observed) on the next pass — the union of first-resolvable anchors. */
  activeAnchors: Element[];
  /** True while interpolation (or anything else) needs another rAF even with no new invalidation signal. */
  needsAnotherFrame: boolean;
};

export type GeometrySchedulerOptions<TSnapshot> = {
  /** True while there is at least one remote cursor; the scheduler attaches signals only in this state. */
  hasActiveCursors(): boolean;
  /** READ+COMPUTE step: given measured rects, resolve the new snapshot and report which anchors matter. */
  compute(state: SchedulerReadState, timestampMs: number): ComputeResult<TSnapshot>;
  notify(snapshot: TSnapshot): void;
  /** Anchor register/unregister notifications (registry.onChange). */
  onRegistryChange(listener: () => void): () => void;
  /** New remote presence data notifications (client.subscribeRemote or store.subscribe). */
  onRemoteData(listener: () => void): () => void;

  root?: Document;
  window?: Window;
  raf?: RafLike;
  caf?: CafLike;
  ResizeObserverCtor?: ResizeObserverCtor;
  MutationObserverCtor?: MutationObserverCtor;
};

export type GeometryScheduler = {
  invalidate(reason?: string): void;
  dispose(): void;
};

type TransitionKey = string;

function transitionKey(target: EventTarget | null, name: string): TransitionKey {
  return `${String(target)}::${name}`;
}

function parseCssTimeList(value: string): number[] {
  return value
    .split(",")
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

  const transitionEntries = new Map<TransitionKey, { safetyTimer: ReturnType<typeof setTimeout> }>();

  function measureRect(element: Element): Rect {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

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
    dirty = false;

    const rectCache = new Map<Element, Rect>();
    const readState: SchedulerReadState = {
      getRect(element) {
        let rect = rectCache.get(element);
        if (rect === undefined) {
          rect = measureRect(element);
          rectCache.set(element, rect);
        }
        return rect;
      },
      viewportSize: { width: win.innerWidth, height: win.innerHeight },
    };

    // pre-measure every candidate anchor once (READ phase) before any compute/consumer code runs
    for (const element of observedAnchors) readState.getRect(element);

    const result = options.compute(readState, timestampMs);
    syncObservedAnchors(result.activeAnchors);
    options.notify(result.snapshot);

    if (result.needsAnotherFrame || dirty) {
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
  function onMutation(): void {
    markDirtyAndSchedule();
  }

  function closeTransitionEntry(key: TransitionKey): void {
    const entry = transitionEntries.get(key);
    if (entry === undefined) return;
    clearTimeout(entry.safetyTimer);
    transitionEntries.delete(key);
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
    const key = transitionKey(target, name ?? "");
    closeTransitionEntry(key);

    let windowMs: number;
    if (isAnimation && target instanceof Element && isInfiniteIterationAnimation(target)) {
      // infinite-iteration animations get one short window instead of a tracked entry — spinners cannot pin the rAF loop
      windowMs = INFINITE_ANIMATION_WINDOW_MS;
    } else {
      const timingMs = target instanceof Element ? readTimingMs(target, isAnimation) : 0;
      windowMs = Math.min(timingMs + CANCEL_SAFETY_MARGIN_MS, SAFETY_TIMEOUT_CAP_MS);
    }

    const safetyTimer = setTimeout(() => {
      closeTransitionEntry(key);
      markDirtyAndSchedule();
    }, windowMs);
    transitionEntries.set(key, { safetyTimer });
    markDirtyAndSchedule();
  }

  function onTransitionEnd(event: Event): void {
    const isAnimation = event.type.startsWith("animation");
    const name = isAnimation ? (event as AnimationEvent).animationName : (event as TransitionEvent).propertyName;
    closeTransitionEntry(transitionKey(event.target, name ?? ""));
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

    if (MutationObserverImpl) {
      mutationObserver = new MutationObserverImpl(onMutation);
      mutationObserver.observe(doc.body, { childList: true, attributes: true, subtree: true });
    }

    for (const type of TRANSITION_START_EVENTS) {
      doc.addEventListener(type, onTransitionStart as EventListener, { capture: true });
    }
    for (const type of TRANSITION_END_EVENTS) {
      doc.addEventListener(type, onTransitionEnd as EventListener, { capture: true });
    }

    scheduleFrame();
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

    for (const type of TRANSITION_START_EVENTS) {
      doc.removeEventListener(type, onTransitionStart as EventListener, { capture: true });
    }
    for (const type of TRANSITION_END_EVENTS) {
      doc.removeEventListener(type, onTransitionEnd as EventListener, { capture: true });
    }
    for (const key of Array.from(transitionEntries.keys())) closeTransitionEntry(key);

    if (rafHandle !== null) {
      caf(rafHandle);
      rafHandle = null;
    }
    dirty = false;
  }

  function syncActivation(): void {
    if (disposed) return;
    const shouldBeActive = options.hasActiveCursors();
    if (shouldBeActive && !attached) attach();
    else if (!shouldBeActive && attached) detach();
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

    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      unsubRemoteData();
      unsubRegistryChange();
    },
  };
}

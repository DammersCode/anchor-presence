// Scheduler signal wiring: resize, scroll, observer and transition events that invalidate the scheduler (spec §11)

import type {
  ClearTimeoutLike,
  MutationObserverCtor,
  MutationObserverLike,
  ResizeObserverCtor,
  ResizeObserverLike,
  SetTimeoutLike,
} from "../scheduler.js";

import { isShadowRoot } from "../dom-tree.js";

const TRANSITION_START_EVENTS = ["transitionrun", "animationstart"] as const;
const TRANSITION_END_EVENTS = [
  "transitionend",
  "transitioncancel",
  "animationend",
  "animationcancel",
] as const;

const NON_GEOMETRY_PROPERTIES = new Set(["opacity", "color", "background-color", "box-shadow", "filter"]);

const SAFETY_TIMEOUT_CAP_MS = 10_000;
const INFINITE_ANIMATION_WINDOW_MS = 500;
const CANCEL_SAFETY_MARGIN_MS = 500;

const MUTATION_OBSERVE_OPTIONS: MutationObserverInit = { childList: true, attributes: true, subtree: true };

// document-level scroll/mutation signals stop at shadow boundaries; observe each anchor's roots directly
function isElementNode(node: unknown): node is Element {
  return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

function collectShadowRoots(anchors: Iterable<Element>): Set<ShadowRoot> {
  const roots = new Set<ShadowRoot>();
  for (const el of anchors) {
    let root = el.getRootNode();
    while (isShadowRoot(root)) {
      roots.add(root);
      root = root.host.getRootNode();
    }
  }
  return roots;
}

// own cursor renders mutate the DOM every frame; reacting to them would defeat the interpolation-only reuse path
function isCursorRootMutation(record: MutationRecord, markerAttribute: string): boolean {
  const target = record.target;
  const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
  return element !== null && element.closest(`[${markerAttribute}]`) !== null;
}

function parseCssTimeList(value: string): number[] {
  return (
    value
      .split(",")
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- Number("0.3s") is NaN; parseFloat reads the leading number
      .map((v) => Number.parseFloat(v))
      .map((n) => (Number.isFinite(n) ? n * 1000 : 0))
  );
}

export type SignalHubHost = {
  doc: Document;
  win: Window;
  setTimer: SetTimeoutLike;
  clearTimer: ClearTimeoutLike;
  markerAttribute: string;
  ResizeObserverCtor?: ResizeObserverCtor | undefined;
  MutationObserverCtor?: MutationObserverCtor | undefined;
  onInvalidate: () => void;
  onMutationRecords?: ((records?: MutationRecord[]) => void) | undefined;
};

export type SignalHub = {
  attach(): void;
  detach(): void;
  syncAnchors(anchors: Element[]): void;
  anchors(): Set<Element>;
  hasOpenTransitions(): boolean;
};

export function createSignalHub(host: SignalHubHost): SignalHub {
  const {
    doc,
    win,
    setTimer,
    clearTimer,
    markerAttribute,
    ResizeObserverCtor,
    MutationObserverCtor,
    onInvalidate,
    onMutationRecords,
  } = host;

  let observedAnchors = new Set<Element>();
  let resizeObserver: ResizeObserverLike | null = null;
  let mutationObserver: MutationObserverLike | null = null;
  const shadowRootObservers = new Map<ShadowRoot, MutationObserverLike | null>();

  // per-target keying: distinct elements with the same property/animation name must not collide (spec §11)
  const transitionEntries = new Map<
    EventTarget,
    Map<string, { safetyTimer: ReturnType<typeof setTimeout> }>
  >();
  let openTransitionCount = 0;

  function onWindowResize(): void {
    onInvalidate();
  }
  function onDocumentScroll(): void {
    onInvalidate();
  }
  function onResizeObserverEntry(): void {
    onInvalidate();
  }
  function onMutation(records?: MutationRecord[]): void {
    if (records === undefined) {
      onMutationRecords?.(records);
      onInvalidate();
      return;
    }

    let hasRelevantRecord = false;
    for (const record of records) {
      if (!isCursorRootMutation(record, markerAttribute)) {
        hasRelevantRecord = true;
        break;
      }
    }

    if (hasRelevantRecord) {
      onMutationRecords?.(records);
      onInvalidate();
    }
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
      if (MutationObserverCtor) {
        observer = new MutationObserverCtor(onMutation);
        observer.observe(root, MUTATION_OBSERVE_OPTIONS);
      }
      shadowRootObservers.set(root, observer);
    }
  }

  function syncAnchors(next: Element[]): void {
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

  function isIgnoredTransition(event: Event): boolean {
    const { target } = event;
    if (isElementNode(target) && target.closest(`[${markerAttribute}]`) !== null) return true;
    return (
      event.type.startsWith("transition") &&
      NON_GEOMETRY_PROPERTIES.has((event as TransitionEvent).propertyName)
    );
  }

  function onTransitionStart(event: Event): void {
    if (isIgnoredTransition(event)) return;
    const isAnimation = event.type === "animationstart";
    const name = isAnimation
      ? (event as AnimationEvent).animationName
      : (event as TransitionEvent).propertyName;
    const target = event.target;
    if (target === null) return;
    closeTransitionEntry(target, name ?? "");

    let windowMs: number;
    if (isAnimation && isElementNode(target) && isInfiniteIterationAnimation(target)) {
      // infinite-iteration animations get one short window instead of a tracked entry — spinners cannot pin the rAF loop
      windowMs = INFINITE_ANIMATION_WINDOW_MS;
    } else {
      const timingMs = isElementNode(target) ? readTimingMs(target, isAnimation) : 0;
      windowMs = Math.min(timingMs + CANCEL_SAFETY_MARGIN_MS, SAFETY_TIMEOUT_CAP_MS);
    }

    const safetyTimer = setTimer(() => {
      closeTransitionEntry(target, name ?? "");
      onInvalidate();
    }, windowMs);
    let byName = transitionEntries.get(target);
    if (byName === undefined) {
      byName = new Map();
      transitionEntries.set(target, byName);
    }
    byName.set(name ?? "", { safetyTimer });
    openTransitionCount += 1;
    onInvalidate();
  }

  function onTransitionEnd(event: Event): void {
    if (isIgnoredTransition(event)) return;
    const isAnimation = event.type.startsWith("animation");
    const name = isAnimation
      ? (event as AnimationEvent).animationName
      : (event as TransitionEvent).propertyName;
    closeTransitionEntry(event.target, name ?? "");
    onInvalidate();
  }

  function attach(): void {
    win.addEventListener("resize", onWindowResize);
    doc.addEventListener("scroll", onDocumentScroll, { capture: true, passive: true });

    if (ResizeObserverCtor) {
      resizeObserver = new ResizeObserverCtor(onResizeObserverEntry);
      resizeObserver.observe(doc.documentElement);
    }

    // body can still be null when attach runs from a <head> script; documentElement covers the later body subtree
    const mutationTarget: Node | null = doc.body ?? doc.documentElement;
    if (MutationObserverCtor && mutationTarget !== null) {
      mutationObserver = new MutationObserverCtor(onMutation);
      mutationObserver.observe(mutationTarget, MUTATION_OBSERVE_OPTIONS);
    }

    for (const type of TRANSITION_START_EVENTS) {
      doc.addEventListener(type, onTransitionStart, { capture: true });
    }
    for (const type of TRANSITION_END_EVENTS) {
      doc.addEventListener(type, onTransitionEnd, { capture: true });
    }
  }

  function detach(): void {
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
  }

  return {
    attach,
    detach,
    syncAnchors,
    anchors() {
      return observedAnchors;
    },
    hasOpenTransitions() {
      return openTransitionCount > 0;
    },
  };
}

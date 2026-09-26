import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeometryScheduler } from "../src/scheduler";
import type {
  ClearTimeoutLike,
  ComputeResult,
  MutationObserverCtor,
  RafLike,
  ResizeObserverCtor,
  SetTimeoutLike,
} from "../src/scheduler";

type RafQueueEntry = { handle: number; callback: (ts: number) => void };

function makeRafStub() {
  let nextHandle = 1;
  const queue: RafQueueEntry[] = [];
  const raf: RafLike = (cb) => {
    const handle = nextHandle++;
    queue.push({ handle, callback: cb });
    return handle;
  };
  const caf = vi.fn((handle: number) => {
    const idx = queue.findIndex((e) => e.handle === handle);
    if (idx >= 0) queue.splice(idx, 1);
  });
  function flush(ts = 0): void {
    const pending = queue.splice(0);
    for (const entry of pending) entry.callback(ts);
  }
  return { raf, caf, queue, flush };
}

function makeTimerStub() {
  const pending = new Map<ReturnType<typeof setTimeout>, { callback: () => void; ms: number }>();
  let nextId = 1;
  const setTimeoutFn: SetTimeoutLike = vi.fn((callback, ms) => {
    const handle = nextId++ as unknown as ReturnType<typeof setTimeout>;
    pending.set(handle, { callback, ms });
    return handle;
  });
  const clearTimeoutFn: ClearTimeoutLike = vi.fn((handle) => {
    pending.delete(handle);
  });
  function fireAll(): void {
    for (const [handle, entry] of Array.from(pending)) {
      pending.delete(handle);
      entry.callback();
    }
  }
  return { setTimeoutFn, clearTimeoutFn, fireAll };
}

function makeResizeObserverStub() {
  const instances: {
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    callback: () => void;
  }[] = [];
  const ctor = function (callback: () => void) {
    const instance = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), callback };
    instances.push(instance);
    return instance;
  } as unknown as ResizeObserverCtor;
  return { ctor, instances };
}

function makeMutationObserverStub() {
  const instances: {
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    callback: (records?: MutationRecord[]) => void;
  }[] = [];
  const ctor = function (callback: (records?: MutationRecord[]) => void) {
    const instance = { observe: vi.fn(), disconnect: vi.fn(), callback };
    instances.push(instance);
    return instance;
  } as unknown as MutationObserverCtor;
  return { ctor, instances };
}

function fakeComputedStyle(values: Record<string, string>): CSSStyleDeclaration {
  return { getPropertyValue: (prop: string) => values[prop] ?? "" } as unknown as CSSStyleDeclaration;
}

function fakeRecord(target: Node): MutationRecord {
  return {
    type: "attributes",
    target,
    addedNodes: document.querySelectorAll("#none"),
    removedNodes: document.querySelectorAll("#none"),
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  };
}

function emptyCompute<T>(snapshot: T): ComputeResult<T> {
  return { snapshot, activeAnchors: [], needsAnotherFrame: false };
}

describe("createGeometryScheduler (spec §11)", () => {
  let active = false;
  let remoteDataListeners: Array<() => void>;
  let registryChangeListeners: Array<() => void>;

  beforeEach(() => {
    document.body.innerHTML = "";
    active = false;
    remoteDataListeners = [];
    registryChangeListeners = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseOptions(overrides: Partial<Parameters<typeof createGeometryScheduler>[0]> = {}) {
    return {
      hasActiveCursors: () => active,
      compute: vi.fn(() => emptyCompute([])),
      notify: vi.fn(),
      onRegistryChange: (listener: () => void) => {
        registryChangeListeners.push(listener);
        return () => {
          registryChangeListeners = registryChangeListeners.filter((l) => l !== listener);
        };
      },
      onRemoteData: (listener: () => void) => {
        remoteDataListeners.push(listener);
        return () => {
          remoteDataListeners = remoteDataListeners.filter((l) => l !== listener);
        };
      },
      ...overrides,
    };
  }

  it("coalesces multiple invalidate() calls into a single rAF pass", () => {
    const { raf, caf, queue, flush } = makeRafStub();
    active = true;
    const compute = vi.fn(() => emptyCompute([]));
    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));

    compute.mockClear();
    scheduler.invalidate("a");
    scheduler.invalidate("b");
    scheduler.invalidate("c");

    expect(queue).toHaveLength(1);
    flush();
    expect(compute).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it("measures each active anchor exactly once per frame", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const el = document.createElement("div");
    document.body.append(el);
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect");

    let returnedAnchors = [el];
    const compute = vi.fn((readState) => {
      readState.getRect(el); // compute may also ask for the rect; must still be a single measurement
      readState.getRect(el);
      return { snapshot: [], activeAnchors: returnedAnchors, needsAnotherFrame: false };
    });

    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
    scheduler.invalidate();
    flush();

    expect(getRectSpy).toHaveBeenCalledTimes(1);

    scheduler.invalidate();
    flush();
    expect(getRectSpy).toHaveBeenCalledTimes(2); // one more measurement in the second frame

    scheduler.dispose();
  });

  it("idle (no active cursors): no rAF scheduled and no signals attached", () => {
    const { raf, caf } = makeRafStub();
    active = false;
    const resizeObs = makeResizeObserverStub();
    const mutationObs = makeMutationObserverStub();
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const winAddEventListenerSpy = vi.spyOn(window, "addEventListener");

    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, ResizeObserverCtor: resizeObs.ctor, MutationObserverCtor: mutationObs.ctor }),
    );

    scheduler.invalidate();

    expect(resizeObs.instances).toHaveLength(0);
    expect(mutationObs.instances).toHaveLength(0);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith("scroll", expect.anything(), expect.anything());
    expect(winAddEventListenerSpy).not.toHaveBeenCalledWith("resize", expect.anything());

    scheduler.dispose();
  });

  it("active (>=1 remote cursor): attaches resize, scroll, ResizeObserver, MutationObserver", () => {
    const { raf, caf } = makeRafStub();
    active = true;
    const resizeObs = makeResizeObserverStub();
    const mutationObs = makeMutationObserverStub();
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const winAddEventListenerSpy = vi.spyOn(window, "addEventListener");

    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, ResizeObserverCtor: resizeObs.ctor, MutationObserverCtor: mutationObs.ctor }),
    );
    scheduler.invalidate();

    expect(resizeObs.instances).toHaveLength(1);
    expect(mutationObs.instances).toHaveLength(1);
    expect(mutationObs.instances[0]?.observe).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ childList: true, attributes: true, subtree: true }),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), {
      capture: true,
      passive: true,
    });
    expect(winAddEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    scheduler.dispose();
  });

  it("transitions from idle to active when onRemoteData fires with a newly-active state, and back to idle", () => {
    const { raf, caf } = makeRafStub();
    active = false;
    const resizeObs = makeResizeObserverStub();
    const mutationObs = makeMutationObserverStub();

    createGeometryScheduler(
      baseOptions({ raf, caf, ResizeObserverCtor: resizeObs.ctor, MutationObserverCtor: mutationObs.ctor }),
    );

    expect(mutationObs.instances).toHaveLength(0);

    active = true;
    for (const listener of remoteDataListeners) listener();
    expect(mutationObs.instances).toHaveLength(1);

    active = false;
    for (const listener of remoteDataListeners) listener();
    expect(mutationObs.instances[0]?.disconnect).toHaveBeenCalled();
  });

  it("full cleanup on dispose: observers disconnected, listeners removed, pending rAF cancelled", () => {
    const { raf, caf, queue } = makeRafStub();
    active = true;
    const resizeObs = makeResizeObserverStub();
    const mutationObs = makeMutationObserverStub();
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const winRemoveEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, ResizeObserverCtor: resizeObs.ctor, MutationObserverCtor: mutationObs.ctor }),
    );
    scheduler.invalidate();
    expect(queue).toHaveLength(1);

    scheduler.dispose();

    expect(caf).toHaveBeenCalled();
    expect(resizeObs.instances[0]?.disconnect).toHaveBeenCalled();
    expect(mutationObs.instances[0]?.disconnect).toHaveBeenCalled();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
    expect(winRemoveEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("re-schedules a frame while the compute result reports needsAnotherFrame (interpolation in flight)", () => {
    const { raf, caf, queue, flush } = makeRafStub();
    active = true;
    let unsettled = true;
    const compute = vi.fn(() => ({ snapshot: [], activeAnchors: [], needsAnotherFrame: unsettled }));

    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
    scheduler.invalidate();
    expect(queue).toHaveLength(1);

    flush();
    expect(queue).toHaveLength(1); // still unsettled -> scheduled another frame automatically

    unsettled = false;
    flush();
    expect(queue).toHaveLength(0); // settled -> no more auto-scheduling

    scheduler.dispose();
  });

  it("transition entry closes on transitioncancel", () => {
    vi.useFakeTimers();
    const { raf, caf } = makeRafStub();
    active = true;
    const scheduler = createGeometryScheduler(baseOptions({ raf, caf }));
    scheduler.invalidate();

    const el = document.createElement("div");
    document.body.append(el);

    const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
      propertyName: string;
    };
    Object.defineProperty(startEvent, "propertyName", { value: "opacity" });
    el.dispatchEvent(startEvent);

    const cancelEvent = new Event("transitioncancel", { bubbles: true }) as TransitionEvent & {
      propertyName: string;
    };
    Object.defineProperty(cancelEvent, "propertyName", { value: "opacity" });
    el.dispatchEvent(cancelEvent);

    // closed entry leaves no pending safety timer behind
    expect(vi.getTimerCount()).toBe(0);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("F2: distinct elements animating the same property keep independent tracked entries (per-target keying)", () => {
    vi.useFakeTimers();
    try {
      const { raf, caf, flush } = makeRafStub();
      active = true;
      const compute = vi.fn(() => emptyCompute([]));
      const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
      scheduler.invalidate();
      flush();

      const elA = document.createElement("div");
      const elB = document.createElement("div");
      document.body.append(elA, elB);
      vi.spyOn(window, "getComputedStyle").mockReturnValue(
        fakeComputedStyle({
          "transition-duration": "5s",
          "transition-delay": "0s",
          "animation-iteration-count": "1",
        }),
      );

      const startA = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(startA, "propertyName", { value: "opacity" });
      elA.dispatchEvent(startA);
      flush();

      const startB = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(startB, "propertyName", { value: "opacity" });
      elB.dispatchEvent(startB);
      flush();

      // ending elA's transition must not close elB's window
      const endA = new Event("transitionend", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(endA, "propertyName", { value: "opacity" });
      elA.dispatchEvent(endA);
      flush();

      // elB's window is still open: the pass must keep re-running with no further invalidate() calls
      compute.mockClear();
      flush();
      expect(compute).toHaveBeenCalledTimes(1);

      const endB = new Event("transitionend", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(endB, "propertyName", { value: "opacity" });
      elB.dispatchEvent(endB);
      flush();

      compute.mockClear();
      flush();
      expect(compute).not.toHaveBeenCalled(); // both windows closed now

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("transition entry closes via the safety timeout (fake timers) when no end/cancel event arrives", () => {
    vi.useFakeTimers();
    try {
      const { raf, caf, flush } = makeRafStub();
      active = true;
      const compute = vi.fn(() => emptyCompute([]));
      const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
      scheduler.invalidate();
      flush();

      const el = document.createElement("div");
      document.body.append(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue(
        fakeComputedStyle({
          "transition-duration": "0.2s",
          "transition-delay": "0s",
          "animation-iteration-count": "1",
        }),
      );

      const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(startEvent, "propertyName", { value: "opacity" });
      el.dispatchEvent(startEvent);
      flush(); // consume the frame scheduled by the transitionrun invalidation itself

      compute.mockClear();
      // safety window = duration(200ms) + delay(0) + 500ms margin = 700ms, capped at 10s
      vi.advanceTimersByTime(700);
      flush();

      expect(compute).toHaveBeenCalled(); // safety timeout invalidated the scheduler

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes the transition safety timer through the injected setTimeout/clearTimeout", () => {
    const { raf, caf, flush } = makeRafStub();
    const timers = makeTimerStub();
    active = true;
    const compute = vi.fn(() => emptyCompute([]));
    const scheduler = createGeometryScheduler(
      baseOptions({
        raf,
        caf,
        compute,
        setTimeout: timers.setTimeoutFn,
        clearTimeout: timers.clearTimeoutFn,
      }),
    );
    scheduler.invalidate();
    flush();

    const el = document.createElement("div");
    document.body.append(el);
    vi.spyOn(window, "getComputedStyle").mockReturnValue(
      fakeComputedStyle({
        "transition-duration": "0.2s",
        "transition-delay": "0s",
        "animation-iteration-count": "1",
      }),
    );

    const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
      propertyName: string;
    };
    Object.defineProperty(startEvent, "propertyName", { value: "opacity" });
    el.dispatchEvent(startEvent);
    flush(); // consume the frame scheduled by the transitionrun invalidation itself
    compute.mockClear();

    // 200ms duration + 500ms margin; only the injected stub knows about this timer
    expect(timers.setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(timers.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 700);

    timers.fireAll();
    flush(); // the safety-timeout invalidation's own pass
    expect(compute).toHaveBeenCalledTimes(1);

    compute.mockClear();
    flush();
    expect(compute).not.toHaveBeenCalled(); // window closed: no more auto-scheduled passes

    expect(timers.clearTimeoutFn).toHaveBeenCalledTimes(1); // the entry closed itself via the injected clearTimeout
    scheduler.dispose();
  });

  it("an infinite-iteration animation gets a single 500ms window instead of a tracked entry", () => {
    vi.useFakeTimers();
    try {
      const { raf, caf, flush } = makeRafStub();
      active = true;
      const compute = vi.fn(() => emptyCompute([]));
      const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
      scheduler.invalidate();
      flush();

      const el = document.createElement("div");
      document.body.append(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue(
        fakeComputedStyle({
          "animation-duration": "2s",
          "animation-delay": "0s",
          "animation-iteration-count": "infinite",
        }),
      );

      const startEvent = new Event("animationstart", { bubbles: true }) as AnimationEvent & {
        animationName: string;
      };
      Object.defineProperty(startEvent, "animationName", { value: "spin" });
      el.dispatchEvent(startEvent);
      flush(); // consume the frame scheduled by the animationstart invalidation itself

      compute.mockClear();
      vi.advanceTimersByTime(499);
      flush();
      expect(compute).toHaveBeenCalled(); // window still open: every pass re-runs (spec §11 continuous rAF)
      compute.mockClear();
      vi.advanceTimersByTime(2);
      flush();
      expect(compute).toHaveBeenCalled(); // closed at ~500ms, not at animation-duration (2s)

      compute.mockClear();
      flush();
      expect(compute).not.toHaveBeenCalled(); // window closed: no more auto-scheduled passes

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("F1: an open transition window drives continuous rAF invalidation — every frame re-runs compute until the entry closes", () => {
    vi.useFakeTimers();
    try {
      const { raf, caf, flush } = makeRafStub();
      active = true;
      const compute = vi.fn(() => emptyCompute([]));
      const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
      scheduler.invalidate();
      flush();

      const el = document.createElement("div");
      document.body.append(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue(
        fakeComputedStyle({
          "transition-duration": "5s", // long enough that the safety timeout won't fire mid-test
          "transition-delay": "0s",
          "animation-iteration-count": "1",
        }),
      );

      const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(startEvent, "propertyName", { value: "transform" });
      el.dispatchEvent(startEvent);
      flush(); // consume the frame scheduled by the transitionrun invalidation itself

      // while the window is open, every stepped frame must re-run compute with no further invalidate() calls
      for (let i = 0; i < 5; i++) {
        compute.mockClear();
        flush();
        expect(compute).toHaveBeenCalledTimes(1);
      }

      const endEvent = new Event("transitionend", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(endEvent, "propertyName", { value: "transform" });
      el.dispatchEvent(endEvent);
      flush(); // the closing invalidation's own pass

      compute.mockClear();
      flush();
      expect(compute).not.toHaveBeenCalled(); // window closed: no more auto-scheduled passes

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("F1: the rAF loop stops via the safety timeout when no end/cancel event ever arrives, after re-running every frame in between", () => {
    vi.useFakeTimers();
    try {
      const { raf, caf, flush } = makeRafStub();
      active = true;
      const compute = vi.fn(() => emptyCompute([]));
      const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
      scheduler.invalidate();
      flush();

      const el = document.createElement("div");
      document.body.append(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue(
        fakeComputedStyle({
          "transition-duration": "0.2s",
          "transition-delay": "0s",
          "animation-iteration-count": "1",
        }),
      );

      const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & {
        propertyName: string;
      };
      Object.defineProperty(startEvent, "propertyName", { value: "opacity" });
      el.dispatchEvent(startEvent);
      flush();

      // safety window = duration(200ms) + delay(0) + 500ms margin = 700ms; step in smaller increments,
      // asserting each stepped frame re-runs compute while the window remains open
      compute.mockClear();
      vi.advanceTimersByTime(300);
      flush();
      expect(compute).toHaveBeenCalled();

      compute.mockClear();
      vi.advanceTimersByTime(300);
      flush();
      expect(compute).toHaveBeenCalled();

      compute.mockClear();
      vi.advanceTimersByTime(100); // crosses the 700ms safety timeout
      flush();
      expect(compute).toHaveBeenCalled(); // the safety-timeout invalidation's own pass

      compute.mockClear();
      flush();
      expect(compute).not.toHaveBeenCalled(); // window closed: no more auto-scheduled passes

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("F3: interpolation-only frames (needsAnotherFrame, no invalidation, no open transition) reuse cached rects with zero re-measures", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const el = document.createElement("div");
    document.body.append(el);
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect");
    let clientMetricReads = 0;
    const metric = () => {
      clientMetricReads += 1;
      return 100;
    };
    Object.defineProperties(el, {
      clientHeight: { configurable: true, get: metric },
      clientLeft: { configurable: true, get: metric },
      clientTop: { configurable: true, get: metric },
      clientWidth: { configurable: true, get: metric },
      offsetHeight: { configurable: true, get: metric },
      offsetWidth: { configurable: true, get: metric },
    });

    let unsettled = true;
    const compute = vi.fn((readState) => {
      readState.getRect(el);
      readState.getClientRect(el);
      return { snapshot: [], activeAnchors: [el], needsAnotherFrame: unsettled };
    });

    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
    scheduler.invalidate();
    flush();
    expect(getRectSpy).toHaveBeenCalledTimes(1); // the invalidated pass measures once
    expect(clientMetricReads).toBeGreaterThan(0);

    getRectSpy.mockClear();
    clientMetricReads = 0;
    flush(); // interpolation-only pass (still unsettled), no invalidate() call in between
    expect(getRectSpy).not.toHaveBeenCalled();
    expect(clientMetricReads).toBe(0);

    flush(); // another interpolation-only pass
    expect(getRectSpy).not.toHaveBeenCalled();
    expect(clientMetricReads).toBe(0);

    unsettled = false;
    flush(); // settle: no further auto-scheduled frame
    expect(getRectSpy).not.toHaveBeenCalled();
    expect(clientMetricReads).toBe(0);

    // a fresh invalidate() must re-measure
    unsettled = true;
    scheduler.invalidate();
    flush();
    expect(getRectSpy).toHaveBeenCalledTimes(1);
    expect(clientMetricReads).toBeGreaterThan(0);

    scheduler.dispose();
  });

  it("M-D-1: mutation records from inside [data-anchor-presence-cursor] roots do not dirty the scheduler", () => {
    const { raf, caf, queue, flush } = makeRafStub();
    active = true;
    const mutationObs = makeMutationObserverStub();
    const cursorRoot = document.createElement("div");
    cursorRoot.dataset.anchorPresenceCursor = "";
    const cursorChild = document.createElement("div");
    cursorRoot.append(cursorChild);
    const cursorText = document.createTextNode("label");
    cursorChild.append(cursorText);
    document.body.append(cursorRoot);
    const outside = document.createElement("div");
    document.body.append(outside);

    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, MutationObserverCtor: mutationObs.ctor }),
    );
    flush(); // consume the attach-time frame
    expect(queue).toHaveLength(0);

    mutationObs.instances[0]?.callback([
      fakeRecord(cursorRoot),
      fakeRecord(cursorChild),
      fakeRecord(cursorText),
    ]);
    expect(queue).toHaveLength(0); // all records filtered: not dirty

    mutationObs.instances[0]?.callback([fakeRecord(cursorChild), fakeRecord(outside)]);
    expect(queue).toHaveLength(1); // one surviving record dirties
    flush();

    mutationObs.instances[0]?.callback(); // a legacy no-records callback stays conservative
    expect(queue).toHaveLength(1);

    scheduler.dispose();
  });

  it("D-3: getCachedRect serves the last-measured rect while an invalidation is pending (at most one frame stale)", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const el = document.createElement("div");
    document.body.append(el);
    const compute = vi.fn((readState) => {
      readState.getRect(el);
      return { snapshot: [], activeAnchors: [el], needsAnotherFrame: false };
    });
    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));

    scheduler.invalidate();
    expect(scheduler.getCachedRect(el)).toBeUndefined(); // nothing measured yet

    flush();
    expect(scheduler.getCachedRect(el)).toBeDefined();

    scheduler.invalidate();
    expect(scheduler.getCachedRect(el)).toBeDefined(); // dirty: stale rect is served; the scheduler's next rAF tick re-measures

    flush();
    expect(scheduler.getCachedRect(el)).toBeDefined();

    scheduler.dispose();
    expect(scheduler.getCachedRect(el)).toBeUndefined(); // frame cleared on detach
  });

  it("D-2: attaches scroll + mutation observers to open shadow roots hosting active anchors, and detaches them", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const mutationObs = makeMutationObserverStub();
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const anchor = document.createElement("div");
    shadow.append(anchor);

    let activeAnchors: Element[] = [anchor];
    const compute = vi.fn(() => ({ snapshot: [], activeAnchors, needsAnotherFrame: false }));
    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, compute, MutationObserverCtor: mutationObs.ctor }),
    );
    scheduler.invalidate();
    flush();

    const shadowObserver = mutationObs.instances[1];
    expect(shadowObserver?.observe).toHaveBeenCalledWith(
      shadow,
      expect.objectContaining({ childList: true, attributes: true, subtree: true }),
    );

    // scroll inside the shadow root (composed: false) must still invalidate
    compute.mockClear();
    anchor.dispatchEvent(new Event("scroll"));
    flush();
    expect(compute).toHaveBeenCalledTimes(1);

    // mutation records delivered by the shadow-root observer invalidate too
    compute.mockClear();
    shadowObserver?.callback([fakeRecord(anchor)]);
    flush();
    expect(compute).toHaveBeenCalledTimes(1);

    // once the anchor is no longer active, the shadow-root observer is disconnected
    activeAnchors = [];
    scheduler.invalidate();
    flush();
    expect(shadowObserver?.disconnect).toHaveBeenCalled();

    scheduler.dispose();
  });

  it("D-2: nested shadow roots along the host chain are all observed, and detach() disconnects them", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const mutationObs = makeMutationObserverStub();
    const outerHost = document.createElement("div");
    document.body.append(outerHost);
    const outerShadow = outerHost.attachShadow({ mode: "open" });
    const innerHost = document.createElement("div");
    outerShadow.append(innerHost);
    const innerShadow = innerHost.attachShadow({ mode: "open" });
    const anchor = document.createElement("div");
    innerShadow.append(anchor);

    const compute = vi.fn(() => ({ snapshot: [], activeAnchors: [anchor], needsAnotherFrame: false }));
    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, compute, MutationObserverCtor: mutationObs.ctor }),
    );
    scheduler.invalidate();
    flush();

    const observedRoots = mutationObs.instances
      .slice(1)
      .flatMap((i) => i.observe.mock.calls.map((c) => c[0]));
    expect(observedRoots).toContain(innerShadow);
    expect(observedRoots).toContain(outerShadow);

    scheduler.dispose();
    for (const instance of mutationObs.instances) {
      expect(instance.disconnect).toHaveBeenCalled();
    }
  });

  it("F3: interpolation-only frames reuse cached client rects with zero client-metric reads", () => {
    const { raf, caf, flush } = makeRafStub();
    active = true;
    const el = document.createElement("div");
    document.body.append(el);
    let clientMetricReads = 0;
    const metric = () => {
      clientMetricReads += 1;
      return 100;
    };
    Object.defineProperties(el, {
      clientHeight: { configurable: true, get: metric },
      clientLeft: { configurable: true, get: metric },
      clientTop: { configurable: true, get: metric },
      clientWidth: { configurable: true, get: metric },
      offsetHeight: { configurable: true, get: metric },
      offsetWidth: { configurable: true, get: metric },
    });
    let unsettled = true;
    const compute = vi.fn((readState) => {
      readState.getClientRect(el);
      return { snapshot: [], activeAnchors: [el], needsAnotherFrame: unsettled };
    });

    const scheduler = createGeometryScheduler(baseOptions({ raf, caf, compute }));
    scheduler.invalidate();
    flush();
    expect(clientMetricReads).toBeGreaterThan(0);

    clientMetricReads = 0;
    flush();
    expect(clientMetricReads).toBe(0);

    unsettled = false;
    scheduler.dispose();
  });

  it("calls onAttach, onDetach, and onMutationRecords for mutation callbacks", () => {
    const { raf, caf } = makeRafStub();
    active = true;
    const { ctor, instances } = makeMutationObserverStub();
    const onAttach = vi.fn();
    const onDetach = vi.fn();
    const onMutationRecords = vi.fn();
    const scheduler = createGeometryScheduler(
      baseOptions({ raf, caf, onAttach, onDetach, onMutationRecords, MutationObserverCtor: ctor }),
    );

    expect(onAttach).toHaveBeenCalledTimes(1);

    instances[0]?.callback([fakeRecord(document.body)]);
    expect(onMutationRecords).toHaveBeenCalled();

    active = false;
    scheduler.invalidate();
    expect(onDetach).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });
});

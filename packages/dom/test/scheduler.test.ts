import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeometryScheduler } from "../src/scheduler";
import type {
  ComputeResult,
  MutationObserverCtor,
  MutationObserverLike,
  RafLike,
  ResizeObserverCtor,
  ResizeObserverLike,
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
    const pending = queue.splice(0, queue.length);
    for (const entry of pending) entry.callback(ts);
  }
  return { raf, caf, queue, flush };
}

function makeResizeObserverStub() {
  const instances: { observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; callback: () => void }[] = [];
  const ctor: ResizeObserverCtor = class implements ResizeObserverLike {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(private callback: () => void) {
      instances.push(this as unknown as (typeof instances)[number]);
    }
  } as unknown as ResizeObserverCtor;
  return { ctor, instances };
}

function makeMutationObserverStub() {
  const instances: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; callback: () => void }[] = [];
  const ctor: MutationObserverCtor = class implements MutationObserverLike {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(private callback: () => void) {
      instances.push(this as unknown as (typeof instances)[number]);
    }
  } as unknown as MutationObserverCtor;
  return { ctor, instances };
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
    document.body.appendChild(el);
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
    expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true, passive: true });
    expect(winAddEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    scheduler.dispose();
  });

  it("transitions from idle to active when onRemoteData fires with a newly-active state, and back to idle", () => {
    const { raf, caf } = makeRafStub();
    active = false;
    const resizeObs = makeResizeObserverStub();
    const mutationObs = makeMutationObserverStub();

    createGeometryScheduler(baseOptions({ raf, caf, ResizeObserverCtor: resizeObs.ctor, MutationObserverCtor: mutationObs.ctor }));

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
    const { raf, caf } = makeRafStub();
    active = true;
    const scheduler = createGeometryScheduler(baseOptions({ raf, caf }));
    scheduler.invalidate();

    const el = document.createElement("div");
    document.body.appendChild(el);

    const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & { propertyName: string };
    Object.defineProperty(startEvent, "propertyName", { value: "opacity" });
    el.dispatchEvent(startEvent);

    const cancelEvent = new Event("transitioncancel", { bubbles: true }) as TransitionEvent & { propertyName: string };
    Object.defineProperty(cancelEvent, "propertyName", { value: "opacity" });
    el.dispatchEvent(cancelEvent);

    // no throw, and no leaked timers: dispose should be silent
    scheduler.dispose();
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
      document.body.appendChild(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === "transition-duration") return "0.2s";
          if (prop === "transition-delay") return "0s";
          if (prop === "animation-iteration-count") return "1";
          return "";
        },
      } as unknown as CSSStyleDeclaration);

      const startEvent = new Event("transitionrun", { bubbles: true }) as TransitionEvent & { propertyName: string };
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
      document.body.appendChild(el);
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        getPropertyValue: (prop: string) => {
          if (prop === "animation-duration") return "2s";
          if (prop === "animation-delay") return "0s";
          if (prop === "animation-iteration-count") return "infinite";
          return "";
        },
      } as unknown as CSSStyleDeclaration);

      const startEvent = new Event("animationstart", { bubbles: true }) as AnimationEvent & { animationName: string };
      Object.defineProperty(startEvent, "animationName", { value: "spin" });
      el.dispatchEvent(startEvent);
      flush(); // consume the frame scheduled by the animationstart invalidation itself

      compute.mockClear();
      vi.advanceTimersByTime(499);
      flush();
      expect(compute).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      flush();
      expect(compute).toHaveBeenCalled(); // closed at ~500ms, not at animation-duration (2s)

      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

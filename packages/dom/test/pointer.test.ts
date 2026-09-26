import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchorRegistry } from "../src/registry";
import type { AnchorRegistry } from "../src/registry";
import { attachPointerSource } from "../src/pointer";
import { createGeometryScheduler } from "../src/scheduler";
import type { SchedulerReadState } from "../src/scheduler";
import type { CursorPosition, PointerInfo, PresenceClient } from "@anchor-presence/core";

// jsdom has no layout engine and no PointerEvent constructor; stub both.
function mockRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  });
}

function firePointerEvent(
  type: string,
  target: Element,
  init: { clientX: number; clientY: number; pointerType?: string },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true }) as PointerEvent & {
    clientX: number;
    clientY: number;
  };
  Object.defineProperty(event, "clientX", { value: init.clientX });
  Object.defineProperty(event, "clientY", { value: init.clientY });
  if (init.pointerType !== undefined)
    Object.defineProperty(event, "pointerType", { value: init.pointerType });
  target.dispatchEvent(event);
}

function makeClient(): {
  client: PresenceClient<unknown, unknown>;
  samples: (CursorPosition | null)[];
  pointers: (PointerInfo | undefined)[];
  teardowns: Array<() => void>;
} {
  const samples: (CursorPosition | null)[] = [];
  const pointers: (PointerInfo | undefined)[] = [];
  const teardowns: Array<() => void> = [];
  const client = {
    clientId: "local",
    session: "s1",
    updateLocalCursor: (cursor: CursorPosition | null, pointer?: PointerInfo) => {
      samples.push(cursor);
      pointers.push(pointer);
    },
    setContext: () => {},
    getContext: () => {},
    subscribeContext: () => () => {},
    setUser: () => {},
    getUser: () => {},
    getStatus: () => "connected" as const,
    subscribeStatus: () => () => {},
    getRemoteSnapshot: () => [],
    getRemotePresence: () => [],
    subscribeRemote: () => () => {},
    registerTeardown: (fn: () => void) => {
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },
    dispose: () => {
      for (const fn of teardowns.splice(0)) fn();
    },
  } satisfies PresenceClient<unknown, unknown>;
  return { client, samples, pointers, teardowns };
}

describe("attachPointerSource (spec §9)", () => {
  let registry: AnchorRegistry;

  beforeEach(() => {
    document.body.innerHTML = "";
    registry = createAnchorRegistry();
  });

  it("builds a fallback chain from nested anchors, innermost first, computing u/v per anchor", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.append(inner);
    document.body.append(outer);

    mockRect(outer, { left: 0, top: 0, width: 200, height: 100 });
    mockRect(inner, { left: 50, top: 20, width: 100, height: 40 });

    registry.register("outer", outer);
    registry.register("inner", inner);

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", inner, { clientX: 100, clientY: 40 });

    expect(samples).toHaveLength(1);
    const cursor = samples[0];
    expect(cursor?.anchors.map((a) => a.id)).toEqual(["inner", "outer"]);
    const innerAnchor = cursor?.anchors[0];
    expect(innerAnchor?.u).toBeCloseTo((100 - 50) / 100);
    expect(innerAnchor?.v).toBeCloseTo((40 - 20) / 40);
    const outerAnchor = cursor?.anchors[1];
    expect(outerAnchor?.u).toBeCloseTo(100 / 200);
    expect(outerAnchor?.v).toBeCloseTo(40 / 100);

    handle.detach();
  });

  it("caps the fallback chain at maxAnchors, most specific first", () => {
    const chain: HTMLElement[] = [];
    let parent: HTMLElement = document.body;
    for (let i = 0; i < 6; i++) {
      const el = document.createElement("div");
      mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
      parent.append(el);
      registry.register(`level-${i}`, el);
      chain.push(el);
      parent = el;
    }
    const deepest = chain.at(-1)!;

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", deepest, { clientX: 10, clientY: 10 });

    const cursor = samples[0];
    expect(cursor?.anchors).toHaveLength(4);
    expect(cursor?.anchors.map((a) => a.id)).toEqual(["level-5", "level-4", "level-3", "level-2"]);

    handle.detach();
  });

  it("skips zero-size rects when building the chain", () => {
    const outer = document.createElement("div");
    const zeroSize = document.createElement("div");
    outer.append(zeroSize);
    document.body.append(outer);

    mockRect(outer, { left: 0, top: 0, width: 200, height: 100 });
    mockRect(zeroSize, { left: 0, top: 0, width: 0, height: 0 });

    registry.register("outer", outer);
    registry.register("zero", zeroSize);

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", zeroSize, { clientX: 10, clientY: 10 });

    const cursor = samples[0];
    expect(cursor?.anchors.map((a) => a.id)).toEqual(["outer"]);

    handle.detach();
  });

  it("computes the viewport fallback as clientX/innerWidth, clientY/innerHeight", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 0, height: 0 });

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", el, { clientX: 100, clientY: 50 });

    const cursor = samples[0];
    expect(cursor?.viewport?.u).toBeCloseTo(100 / window.innerWidth);
    expect(cursor?.viewport?.v).toBeCloseTo(50 / window.innerHeight);

    handle.detach();
  });

  it("publishes cursor: null on document pointerleave", () => {
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointerleave", document.documentElement, { clientX: 0, clientY: 0 });

    expect(samples.at(-1)).toBeNull();
    handle.detach();
  });

  it("publishes cursor: null on window blur", () => {
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    window.dispatchEvent(new Event("blur"));

    expect(samples.at(-1)).toBeNull();
    handle.detach();
  });

  it("uses getCachedRect when it returns a hit, skipping getBoundingClientRect for that element", () => {
    const el = document.createElement("div");
    document.body.append(el);
    registry.register("a", el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect");

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, {
      maxAnchors: 4,
      getCachedRect: () => ({ left: 10, top: 10, width: 50, height: 50 }),
    });

    firePointerEvent("pointermove", el, { clientX: 20, clientY: 20 });

    expect(getRectSpy).not.toHaveBeenCalled();
    const cursor = samples[0];
    expect(cursor?.anchors[0]?.u).toBeCloseTo((20 - 10) / 50);
    expect(cursor?.anchors[0]?.v).toBeCloseTo((20 - 10) / 50);

    handle.detach();
  });

  it("falls through to direct measurement on a cache miss (getCachedRect returns undefined)", () => {
    const el = document.createElement("div");
    document.body.append(el);
    registry.register("a", el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect");

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, {
      maxAnchors: 4,
      // eslint-disable-next-line unicorn/no-useless-undefined -- the option type is `() => Rect | undefined`, so the undefined body is required
      getCachedRect: () => undefined,
    });

    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10 });

    expect(getRectSpy).toHaveBeenCalledTimes(1);
    const cursor = samples[0];
    expect(cursor?.anchors[0]?.u).toBeCloseTo(10 / 100);
    expect(cursor?.anchors[0]?.v).toBeCloseTo(10 / 100);

    handle.detach();
  });

  it("without the getCachedRect option, behavior is unchanged (always measures directly)", () => {
    const el = document.createElement("div");
    document.body.append(el);
    registry.register("a", el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect");

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", el, { clientX: 25, clientY: 25 });

    expect(getRectSpy).toHaveBeenCalledTimes(1);
    const cursor = samples[0];
    expect(cursor?.anchors[0]?.u).toBeCloseTo(25 / 100);
    expect(cursor?.anchors[0]?.v).toBeCloseTo(25 / 100);

    handle.detach();
  });

  it("D-4: pointerover produces a sample (pointerenter never reaches the document with an Element target)", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointerover", el, { clientX: 25, clientY: 75 });

    expect(samples).toHaveLength(1);
    expect(samples[0]?.anchors[0]?.u).toBeCloseTo(0.25);
    expect(samples[0]?.anchors[0]?.v).toBeCloseTo(0.75);

    handle.detach();
  });

  it("C-4: passes the event's pointerType to updateLocalCursor; unknown or missing types pass undefined", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);

    const { client, pointers } = makeClient();
    const handle = attachPointerSource(client, registry, { maxAnchors: 4 });

    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10, pointerType: "mouse" });
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10, pointerType: "touch" });
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10, pointerType: "pen" });
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10, pointerType: "eyetracker" });
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10 });

    expect(pointers).toEqual([{ type: "mouse" }, { type: "touch" }, { type: "pen" }, undefined, undefined]);

    handle.detach();
  });

  it("registers its teardown with the client and detach() removes listeners", () => {
    const el = document.createElement("div");
    document.body.append(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);

    const { client, samples } = makeClient();
    attachPointerSource(client, registry, { maxAnchors: 4 });

    client.dispose(); // should invoke the registered teardown (detach)
    samples.length = 0;
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10 });
    expect(samples).toHaveLength(0);
  });
});

describe("pointer path with the scheduler's rect cache (spec §9/§11, K3)", () => {
  it("does not call live getBoundingClientRect while the scheduler is dirty, and positions update on the scheduler's next tick", () => {
    let nextHandle = 1;
    const pending = new Map<number, (ts: number) => void>();
    const raf = (cb: (ts: number) => void) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    };
    const caf = (handle: number) => {
      pending.delete(handle);
    };
    const flush = () => {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(0);
    };

    document.body.innerHTML = "";
    const el = document.createElement("div");
    document.body.append(el);
    let liveRect = { left: 0, top: 0, width: 100, height: 100 };
    const getRectSpy = vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => ({
      left: liveRect.left,
      top: liveRect.top,
      width: liveRect.width,
      height: liveRect.height,
      right: liveRect.left + liveRect.width,
      bottom: liveRect.top + liveRect.height,
      x: liveRect.left,
      y: liveRect.top,
      toJSON() {
        return this;
      },
    }));

    const registry = createAnchorRegistry();
    const scheduler = createGeometryScheduler({
      hasActiveCursors: () => true,
      compute: (readState: SchedulerReadState) => {
        readState.getRect(el);
        return { snapshot: [], activeAnchors: [el], needsAnotherFrame: false };
      },
      notify: () => {},
      onRegistryChange: () => () => {},
      onRemoteData: () => () => {},
      raf,
      caf,
    });
    flush(); // attach-time pass: measures el with left = 0

    registry.register("a", el);
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry, {
      maxAnchors: 4,
      getCachedRect: (element) => scheduler.getCachedRect(element),
    });

    firePointerEvent("pointermove", el, { clientX: 50, clientY: 50 });
    expect(samples).toHaveLength(1);
    expect(samples[0]?.anchors[0]?.u).toBeCloseTo(0.5);
    const readsAfterWarmup = getRectSpy.mock.calls.length;

    scheduler.invalidate(); // dirty: re-measure pending, not yet flushed
    firePointerEvent("pointermove", el, { clientX: 50, clientY: 50 });
    expect(getRectSpy.mock.calls.length).toBe(readsAfterWarmup); // no live read while dirty
    expect(samples).toHaveLength(2);
    expect(samples[1]?.anchors[0]?.u).toBeCloseTo(0.5); // positioned from the cached rect

    liveRect = { left: 10, top: 0, width: 100, height: 100 };
    flush(); // scheduler's next tick re-measures
    expect(getRectSpy.mock.calls.length).toBe(readsAfterWarmup + 1);
    expect(scheduler.getCachedRect(el)).toEqual({ left: 10, top: 0, width: 100, height: 100 });

    firePointerEvent("pointermove", el, { clientX: 50, clientY: 50 });
    expect(samples).toHaveLength(3);
    expect(samples[2]?.anchors[0]?.u).toBeCloseTo(0.4); // (50 - 10) / 100

    handle.detach();
    scheduler.dispose();
  });
});

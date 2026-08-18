import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorPresence, Interpolator, InterpolatorFactory } from "@anchor-presence/core";
import { noneInterpolator } from "@anchor-presence/core";
import { createAnchorRegistry } from "../src/registry";
import type { AnchorRegistry } from "../src/registry";
import { defaultVisibilityPolicy, RemoteResolver, resolveGeometry } from "../src/resolver";
import type { Rect } from "../src/resolver";

function presence(overrides: Partial<CursorPresence> = {}): CursorPresence {
  return {
    version: 1,
    clientId: "remote-1",
    session: "s",
    sequence: 1,
    cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
    ...overrides,
  };
}

function rectMapGetRect(rects: Map<Element, Rect>): (el: Element) => Rect | undefined {
  return (el) => rects.get(el);
}

describe("resolveGeometry (spec §10)", () => {
  let registry: AnchorRegistry;

  beforeEach(() => {
    document.body.replaceChildren();
    registry = createAnchorRegistry();
  });

  it("resolves via the first connected, measurable anchor in the chain (tier: anchor)", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    registry.register("first", first);
    registry.register("second", second);

    const rects = new Map<Element, Rect>([
      [first, { left: 100, top: 200, width: 0, height: 0 }], // zero-size: not measurable
      [second, { left: 10, top: 20, width: 100, height: 50 }],
    ]);

    const p = presence({
      cursor: {
        anchors: [
          { id: "first", u: 0.5, v: 0.5 },
          { id: "second", u: 0.25, v: 0.5 },
        ],
      },
    });

    const result = resolveGeometry(p, registry, rectMapGetRect(rects), { width: 1000, height: 800 });
    expect(result.tier).toBe("anchor");
    expect(result.anchorId).toBe("second");
    expect(result.x).toBeCloseTo(10 + 100 * 0.25);
    expect(result.y).toBeCloseTo(20 + 50 * 0.5);
  });

  it("falls back to viewport tier when no anchor resolves", () => {
    const p = presence({
      cursor: {
        anchors: [{ id: "missing", u: 0.5, v: 0.5 }],
        viewport: { u: 0.25, v: 0.75 },
      },
    });

    const result = resolveGeometry(p, registry, rectMapGetRect(new Map()), { width: 1000, height: 800 });
    expect(result.tier).toBe("viewport");
    expect(result.anchorId).toBeNull();
    expect(result.x).toBeCloseTo(250);
    expect(result.y).toBeCloseTo(600);
  });

  it("falls back to hidden tier when nothing resolves", () => {
    const p = presence({ cursor: { anchors: [{ id: "missing", u: 0.5, v: 0.5 }] } });
    const result = resolveGeometry(p, registry, rectMapGetRect(new Map()), { width: 1000, height: 800 });
    expect(result.tier).toBe("hidden");
    expect(result.anchorId).toBeNull();
  });

  it("hidden tier when cursor is null", () => {
    const p = presence({ cursor: null });
    const result = resolveGeometry(p, registry, rectMapGetRect(new Map()), { width: 1000, height: 800 });
    expect(result.tier).toBe("hidden");
  });

  it("skips unmounted (not connected) anchors", () => {
    const el = document.createElement("div"); // never appended -> not connected
    registry.register("a", el);
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const p = presence({ cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] } });
    const result = resolveGeometry(p, registry, rectMapGetRect(rects), { width: 1000, height: 800 });
    expect(result.tier).toBe("hidden");
  });
});

describe("defaultVisibilityPolicy (spec §10.1)", () => {
  it("shows on anchor and viewport tiers, hides on hidden", () => {
    const p = presence();
    expect(defaultVisibilityPolicy({ presence: p, resolution: { tier: "anchor", anchorId: "a" } })).toBe("show");
    expect(defaultVisibilityPolicy({ presence: p, resolution: { tier: "viewport", anchorId: null } })).toBe("show");
    expect(defaultVisibilityPolicy({ presence: p, resolution: { tier: "hidden", anchorId: null } })).toBe("hide");
  });
});

describe("RemoteResolver (spec §10 + §13)", () => {
  let registry: AnchorRegistry;
  let el: HTMLDivElement;

  beforeEach(() => {
    registry = createAnchorRegistry();
    el = document.createElement("div");
    document.body.appendChild(el);
    registry.register("a", el);
  });

  function spyInterpolator(): { factory: InterpolatorFactory; instance: Interpolator; targetSpy: ReturnType<typeof vi.fn>; shiftSpy: ReturnType<typeof vi.fn> } {
    const targetSpy = vi.fn();
    const shiftSpy = vi.fn();
    let x = 0;
    let y = 0;
    const instance: Interpolator = {
      target: (nx, ny, ts) => {
        x = nx;
        y = ny;
        targetSpy(nx, ny, ts);
      },
      shift: (dx, dy) => {
        x += dx;
        y += dy;
        shiftSpy(dx, dy);
      },
      sample: () => ({ x, y, settled: true }),
    };
    return { factory: () => instance, instance, targetSpy, shiftSpy };
  }

  it("calls target() for a brand-new clientId (first sighting)", () => {
    const { factory, targetSpy } = spyInterpolator();
    const resolver = new RemoteResolver({ registry, interpolatorFactory: factory });
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);

    resolver.resolveAll([presence()], rectMapGetRect(rects), { width: 1000, height: 800 }, new Set(["remote-1"]), 0);

    expect(targetSpy).toHaveBeenCalledTimes(1);
  });

  it("calls target() when the clientId has new network data", () => {
    const { factory, targetSpy } = spyInterpolator();
    const resolver = new RemoteResolver({ registry, interpolatorFactory: factory });
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const getRect = rectMapGetRect(rects);

    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(["remote-1"]), 0);
    targetSpy.mockClear();

    resolver.resolveAll(
      [presence({ sequence: 2, cursor: { anchors: [{ id: "a", u: 0.6, v: 0.6 }] } })],
      getRect,
      { width: 1000, height: 800 },
      new Set(["remote-1"]),
      16,
    );

    expect(targetSpy).toHaveBeenCalledTimes(1);
  });

  it("calls shift() when position changes from a local-only invalidation (no network update)", () => {
    const { factory, targetSpy, shiftSpy } = spyInterpolator();
    const resolver = new RemoteResolver({ registry, interpolatorFactory: factory });
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const getRect = rectMapGetRect(rects);

    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(["remote-1"]), 0);
    targetSpy.mockClear();

    // local layout change moves the anchor; same presence object, no network update flag
    rects.set(el, { left: 50, top: 0, width: 100, height: 100 });
    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(), 16);

    expect(targetSpy).not.toHaveBeenCalled();
    expect(shiftSpy).toHaveBeenCalledTimes(1);
    expect(shiftSpy).toHaveBeenCalledWith(50, 0);
  });

  it("does not call shift() when the resolved position is unchanged", () => {
    const { factory, shiftSpy } = spyInterpolator();
    const resolver = new RemoteResolver({ registry, interpolatorFactory: factory });
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const getRect = rectMapGetRect(rects);

    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(["remote-1"]), 0);
    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(), 16);

    expect(shiftSpy).not.toHaveBeenCalled();
  });

  it("applies a policy override", () => {
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const resolver = new RemoteResolver({
      registry,
      visibilityPolicy: () => "hide",
    });

    const { cursors } = resolver.resolveAll(
      [presence()],
      rectMapGetRect(rects),
      { width: 1000, height: 800 },
      new Set(["remote-1"]),
      0,
    );
    expect(cursors[0]?.visible).toBe(false);
  });

  it("produces a fresh snapshot array each call, and does not mutate previous results (immutability)", () => {
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    // interpolator: none -> sample() always reflects the latest target immediately, making motion easy to assert
    const resolver = new RemoteResolver({ registry, interpolatorFactory: () => noneInterpolator() });
    const getRect = rectMapGetRect(rects);

    const first = resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(["remote-1"]), 0);
    const firstCursor = first.cursors[0];
    const firstCursorSnapshotX = firstCursor?.x;

    const second = resolver.resolveAll(
      [presence({ sequence: 2, cursor: { anchors: [{ id: "a", u: 0.9, v: 0.9 }] } })],
      getRect,
      { width: 1000, height: 800 },
      new Set(["remote-1"]),
      16,
    );

    expect(second.cursors).not.toBe(first.cursors);
    expect(second.cursors[0]?.x).toBeCloseTo(90);
    // the earlier result object must not have been mutated by the later call
    expect(firstCursor?.x).toBe(firstCursorSnapshotX);
    expect(firstCursor?.x).not.toBe(second.cursors[0]?.x);
  });

  it("prunes interpolator state for clientIds no longer present", () => {
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const resolver = new RemoteResolver({ registry });
    const getRect = rectMapGetRect(rects);

    resolver.resolveAll([presence()], getRect, { width: 1000, height: 800 }, new Set(["remote-1"]), 0);
    const { cursors } = resolver.resolveAll([], getRect, { width: 1000, height: 800 }, new Set(), 16);
    expect(cursors).toHaveLength(0);
  });

  it("carries context and user through to the resolved output", () => {
    const rects = new Map<Element, Rect>([[el, { left: 0, top: 0, width: 100, height: 100 }]]);
    const resolver = new RemoteResolver({ registry });
    const p = presence({ context: { route: "/settings" }, user: { name: "Ada" } });

    const { cursors } = resolver.resolveAll(
      [p],
      rectMapGetRect(rects),
      { width: 1000, height: 800 },
      new Set(["remote-1"]),
      0,
    );
    expect(cursors[0]?.context).toEqual({ route: "/settings" });
    expect(cursors[0]?.user).toEqual({ name: "Ada" });
  });
});

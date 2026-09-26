import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchorRegistry } from "../src/registry";
import type { AnchorRegistry } from "../src/registry";

function makeElement(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}

describe("AnchorRegistry (spec §8)", () => {
  let registry: AnchorRegistry;

  beforeEach(() => {
    document.body.innerHTML = "";
    registry = createAnchorRegistry();
  });

  it("registers, mounts, and unmounts", () => {
    const el = makeElement();
    const unregister = registry.register("a", el);
    expect(registry.has("a")).toBe(true);
    expect(registry.get("a")).toBe(el);

    unregister();
    expect(registry.has("a")).toBe(false);
    expect(registry.get("a")).toBeNull();
  });

  it("supports remount: unregister then register a new element under the same id", () => {
    const first = makeElement();
    const unregisterFirst = registry.register("a", first);
    unregisterFirst();

    const second = makeElement();
    registry.register("a", second);
    expect(registry.get("a")).toBe(second);
  });

  it("duplicate id with a different element: new element wins and warns in dev", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = makeElement();
    const second = makeElement();

    registry.register("a", first);
    registry.register("a", second);

    expect(registry.get("a")).toBe(second);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("duplicate id with the same element does not warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = makeElement();
    registry.register("a", el);
    registry.register("a", el);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("unregister only removes the entry if it still points at the same element (stale unregister is a no-op)", () => {
    const first = makeElement();
    const second = makeElement();

    const unregisterFirst = registry.register("a", first);
    registry.register("a", second); // new element wins

    unregisterFirst(); // stale unregister for `first` must not remove `second`
    expect(registry.get("a")).toBe(second);
  });

  it("get returns null when the element is no longer connected (stale isConnected)", () => {
    const el = makeElement();
    registry.register("a", el);
    expect(registry.get("a")).toBe(el);

    el.remove();
    expect(registry.get("a")).toBeNull();
    expect(registry.has("a")).toBe(false);
  });

  it("ancestors() walks up collecting registered anchors, innermost first", () => {
    const outer = makeElement();
    const middle = document.createElement("div");
    const inner = document.createElement("div");
    outer.append(middle);
    middle.append(inner);

    registry.register("outer", outer);
    registry.register("middle", middle);
    registry.register("inner", inner);

    const chain = registry.ancestors(inner);
    expect(chain.map((c) => c.id)).toEqual(["inner", "middle", "outer"]);
  });

  it("ancestors() skips unregistered elements in the chain", () => {
    const outer = makeElement();
    const middleUnregistered = document.createElement("div");
    const inner = document.createElement("div");
    outer.append(middleUnregistered);
    middleUnregistered.append(inner);

    registry.register("outer", outer);
    registry.register("inner", inner);

    const chain = registry.ancestors(inner);
    expect(chain.map((c) => c.id)).toEqual(["inner", "outer"]);
  });

  it("ancestors() cross-checks the forward map to skip a stale reverse-map entry", () => {
    const outer = makeElement();
    const staleElement = document.createElement("div");
    const freshElement = document.createElement("div");
    outer.append(staleElement);

    // register "dup" on staleElement, then replace it with freshElement (new element wins).
    // staleElement's reverse-map entry ("dup") is now stale: byId.get("dup") !== staleElement.
    registry.register("dup", staleElement);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register("dup", freshElement);

    const chain = registry.ancestors(staleElement);
    expect(chain.map((c) => c.id)).not.toContain("dup");
  });

  it("onChange fires on register and on unregister", () => {
    const listener = vi.fn();
    const unsubscribe = registry.onChange(listener);

    const el = makeElement();
    const unregister = registry.register("a", el);
    expect(listener).toHaveBeenCalledTimes(1);

    unregister();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.register("b", el);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

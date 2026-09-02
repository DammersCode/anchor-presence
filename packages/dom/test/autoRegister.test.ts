import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchorRegistry } from "../src/registry";
import { startAutoRegister } from "../src/autoRegister";
import type { MutationObserverCtor } from "../src/scheduler";

type MoInstance = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  callback: (records?: unknown[]) => void;
};

function makeMoStub() {
  const instances: MoInstance[] = [];
  function Ctor(this: unknown, callback: (records?: unknown[]) => void): MoInstance {
    const inst: MoInstance = { observe: vi.fn(), disconnect: vi.fn(), callback };
    instances.push(inst);
    return inst;
  }
  const ctor = Ctor as unknown as MutationObserverCtor;
  const trigger = () => {
    for (const inst of instances) inst.callback();
  };
  return { ctor, instances, trigger };
}

describe("startAutoRegister", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a pre-existing element with the configured attribute on start", () => {
    const { ctor } = makeMoStub();
    const registry = createAnchorRegistry();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div");

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });

    expect(registry.get("a")).toBe(el);
    expect(registry.ancestors(el!)).toContainEqual({ id: "a", element: el });

    handle.dispose();
  });

  it("supports a custom anchor attribute", () => {
    const { ctor } = makeMoStub();
    const registry = createAnchorRegistry();
    const el = document.createElement("div");
    el.setAttribute("data-presence", "custom");
    document.body.append(el);

    const handle = startAutoRegister({ attribute: "data-presence", registry, MutationObserverCtor: ctor });

    expect(registry.get("custom")).toBe(el);

    handle.dispose();
  });

  it("treats id as a normal anchor attribute when configured", () => {
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();
    const el = document.createElement("div");
    el.id = "a";
    document.body.append(el);

    const handle = startAutoRegister({ attribute: "id", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);

    el.id = "b";
    trigger();

    expect(registry.get("a")).toBe(null);
    expect(registry.get("b")).toBe(el);

    handle.dispose();
  });

  it("ignores elements with empty or whitespace-only attribute values and warns in development", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctor } = makeMoStub();
    const registry = createAnchorRegistry();
    const empty = document.createElement("div");
    empty.setAttribute("data-anchor", "");
    const whitespace = document.createElement("div");
    whitespace.setAttribute("data-anchor", "   ");
    document.body.append(empty, whitespace);

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });

    expect(registry.get("")).toBe(null);
    expect(registry.get("   ")).toBe(null);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    handle.dispose();
  });

  it("registers an element appended at runtime after the observer fires", () => {
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });

    const el = document.createElement("div");
    el.setAttribute("data-anchor", "b");
    document.body.append(el);
    trigger();

    expect(registry.get("b")).toBe(el);

    handle.dispose();
  });

  it("unregisters an element when its attribute is removed", () => {
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);

    el.removeAttribute("data-anchor");
    trigger();

    expect(registry.get("a")).toBe(null);

    handle.dispose();
  });

  it("unregisters an element when it is removed from the DOM", () => {
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);

    el.remove();
    trigger();

    expect(registry.get("a")).toBe(null);

    handle.dispose();
  });

  it("changes the registered id when the attribute value changes", () => {
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);

    el.setAttribute("data-anchor", "a2");
    trigger();

    expect(registry.get("a")).toBe(null);
    expect(registry.get("a2")).toBe(el);

    handle.dispose();
  });

  it("keeps duplicate ids deterministic: newest registration wins and warns once in development", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctor } = makeMoStub();
    const registry = createAnchorRegistry();

    const el1 = document.createElement("div");
    el1.setAttribute("data-anchor", "dup");
    const el2 = document.createElement("div");
    el2.setAttribute("data-anchor", "dup");
    document.body.append(el1, el2);

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });

    expect(registry.get("dup")).toBe(el2);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it("reclaims a duplicate id for the older element when the newer element is removed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctor, trigger } = makeMoStub();
    const registry = createAnchorRegistry();

    const el1 = document.createElement("div");
    el1.setAttribute("data-anchor", "dup");
    const el2 = document.createElement("div");
    el2.setAttribute("data-anchor", "dup");
    document.body.append(el1, el2);

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("dup")).toBe(el2);

    el2.remove();
    trigger();

    expect(registry.get("dup")).toBe(el1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it("dispose unregisters auto anchors and disconnects the observer", () => {
    const { ctor, instances } = makeMoStub();
    const registry = createAnchorRegistry();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const handle = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);

    handle.dispose();

    expect(registry.get("a")).toBe(null);
    expect(instances[0]?.disconnect).toHaveBeenCalled();
  });

  it("idempotent remount: start -> dispose -> start leaves no leaked anchors", () => {
    const { ctor, instances } = makeMoStub();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const registry = createAnchorRegistry();
    const h1 = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);
    h1.dispose();
    expect(registry.get("a")).toBe(null);

    const h2 = startAutoRegister({ attribute: "data-anchor", registry, MutationObserverCtor: ctor });
    expect(registry.get("a")).toBe(el);
    h2.dispose();

    expect(instances).toHaveLength(2);
    expect(instances[0]?.disconnect).toHaveBeenCalled();
    expect(instances[1]?.disconnect).toHaveBeenCalled();
  });
});

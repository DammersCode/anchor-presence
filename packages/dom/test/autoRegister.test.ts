import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorPresence, PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "../src/binding";
import type { MutationObserverCtor } from "../src/scheduler";

function makeFakeClient() {
  const teardowns: Array<() => void> = [];
  const client: PresenceClient<unknown, unknown> = {
    clientId: "local",
    session: "s",
    updateLocalCursor: () => {},
    setContext: () => {},
    getContext: () => undefined,
    setUser: () => {},
    getUser: () => undefined,
    getStatus: () => "connected",
    subscribeStatus: () => () => {},
    getRemoteSnapshot: () => [] as CursorPresence[],
    subscribeRemote: () => () => {},
    registerTeardown: (fn) => {
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },
    dispose: () => {
      for (const fn of teardowns.splice(0, teardowns.length)) fn();
    },
  };
  return { client };
}

// deterministic MutationObserver: no microtask, fire sync() on demand
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

describe("createDomBinding autoRegister", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flag off: a [data-anchor] element is not resolvable and no registration observer runs", () => {
    const { ctor, instances } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="a"></div>';

    const binding = createDomBinding(client, { environment: { MutationObserverCtor: ctor } });

    expect(binding.registry.get("a")).toBe(null);
    expect(instances).toHaveLength(0);

    binding.dispose();
  });

  it("flag on: a pre-existing [data-anchor] element is registered on creation", () => {
    const { ctor } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div");

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });

    expect(binding.registry.get("a")).toBe(el);
    expect(binding.registry.ancestors(el!)).toContainEqual({ id: "a", element: el });

    binding.dispose();
  });

  it("flag on: a [data-anchor] node appended at runtime is registered without a new binding", () => {
    const { ctor, trigger } = makeMoStub();
    const { client } = makeFakeClient();

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });

    const el = document.createElement("div");
    el.setAttribute("data-anchor", "b");
    document.body.append(el);
    trigger();

    expect(binding.registry.get("b")).toBe(el);

    binding.dispose();
  });

  it("flag on: removing a [data-anchor] node unregisters it", () => {
    const { ctor, trigger } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(binding.registry.get("a")).toBe(el);

    el.remove();
    trigger();

    expect(binding.registry.get("a")).toBe(null);

    binding.dispose();
  });

  it("flag on: changing the attribute value drops the old anchor and adds the new one", () => {
    const { ctor, trigger } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(binding.registry.get("a")).toBe(el);

    el.setAttribute("data-anchor", "a2");
    trigger();

    expect(binding.registry.get("a")).toBe(null);
    expect(binding.registry.get("a2")).toBe(el);

    binding.dispose();
  });

  it("explicit register wins over auto for the same element; explicit unregister re-allows auto", () => {
    const { ctor } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="auto1"></div>';
    const el = document.querySelector("div")!;

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(binding.registry.get("auto1")).toBe(el);

    const unreg = binding.registry.register("explicit1", el);
    expect(binding.registry.get("explicit1")).toBe(el);
    expect(binding.registry.get("auto1")).toBe(null);

    unreg();
    expect(binding.registry.get("auto1")).toBe(el);
    expect(binding.registry.get("explicit1")).toBe(null);

    binding.dispose();
  });

  it("collision: two [data-anchor] with the same value do not throw; the registry keeps one", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ctor } = makeMoStub();
    const { client } = makeFakeClient();

    const el1 = document.createElement("div");
    el1.setAttribute("data-anchor", "dup");
    const el2 = document.createElement("div");
    el2.setAttribute("data-anchor", "dup");
    document.body.append(el1, el2);

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });

    expect(() => binding.registry.get("dup")).not.toThrow();
    expect(binding.registry.get("dup")).toBe(el2);
    expect(warnSpy).toHaveBeenCalled();

    binding.dispose();
  });

  it("dispose: auto anchors are unregistered and the observer disconnected; explicit anchors remain", () => {
    const { ctor, instances } = makeMoStub();
    const { client } = makeFakeClient();
    document.body.innerHTML = '<div data-anchor="auto1"></div>';
    const autoEl = document.querySelector("div")!;
    const explicitEl = document.createElement("section");
    document.body.append(explicitEl);

    const binding = createDomBinding(client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(binding.registry.get("auto1")).toBe(autoEl);
    const unreg = binding.registry.register("explicit1", explicitEl);

    binding.dispose();

    expect(binding.registry.get("auto1")).toBe(null);
    expect(instances[0]?.disconnect).toHaveBeenCalled();
    expect(binding.registry.get("explicit1")).toBe(explicitEl);

    unreg();
  });

  it("idempotent remount: create -> dispose -> create makes one observer each and no leaked anchors", () => {
    const { ctor, instances } = makeMoStub();
    document.body.innerHTML = '<div data-anchor="a"></div>';
    const el = document.querySelector("div")!;

    const b1 = createDomBinding(makeFakeClient().client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(b1.registry.get("a")).toBe(el);
    b1.dispose();
    expect(b1.registry.get("a")).toBe(null);

    const b2 = createDomBinding(makeFakeClient().client, { autoRegister: true, environment: { MutationObserverCtor: ctor } });
    expect(b2.registry.get("a")).toBe(el);
    b2.dispose();

    expect(instances).toHaveLength(2);
    expect(instances[0]?.disconnect).toHaveBeenCalled();
    expect(instances[1]?.disconnect).toHaveBeenCalled();
  });
});

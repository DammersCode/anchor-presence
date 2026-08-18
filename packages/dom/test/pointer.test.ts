import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnchorRegistry } from "../src/registry";
import type { AnchorRegistry } from "../src/registry";
import { attachPointerSource, DEFAULT_MAX_ANCHORS } from "../src/pointer";
import type { CursorPosition, PresenceClient } from "@anchor-presence/core";

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
  init: { clientX: number; clientY: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true }) as PointerEvent & {
    clientX: number;
    clientY: number;
  };
  Object.defineProperty(event, "clientX", { value: init.clientX });
  Object.defineProperty(event, "clientY", { value: init.clientY });
  target.dispatchEvent(event);
}

function makeClient(): { client: PresenceClient<unknown, unknown>; samples: (CursorPosition | null)[] } {
  const samples: (CursorPosition | null)[] = [];
  const teardowns: Array<() => void> = [];
  const client = {
    clientId: "local",
    session: "s1",
    updateLocalCursor: (cursor: CursorPosition | null) => samples.push(cursor),
    setContext: () => {},
    setUser: () => {},
    getStatus: () => "connected" as const,
    subscribeStatus: () => () => {},
    getRemoteSnapshot: () => [],
    subscribeRemote: () => () => {},
    registerTeardown: (fn: () => void) => teardowns.push(fn),
    dispose: () => {
      for (const fn of teardowns) fn();
    },
  } satisfies PresenceClient<unknown, unknown>;
  return { client, samples };
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
    outer.appendChild(inner);
    document.body.appendChild(outer);

    mockRect(outer, { left: 0, top: 0, width: 200, height: 100 });
    mockRect(inner, { left: 50, top: 20, width: 100, height: 40 });

    registry.register("outer", outer);
    registry.register("inner", inner);

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

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

  it("caps the fallback chain at maxAnchors (default 4), most specific first", () => {
    const chain: HTMLElement[] = [];
    let parent: HTMLElement = document.body;
    for (let i = 0; i < 6; i++) {
      const el = document.createElement("div");
      mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
      parent.appendChild(el);
      registry.register(`level-${i}`, el);
      chain.push(el);
      parent = el;
    }
    const deepest = chain[chain.length - 1]!;

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

    firePointerEvent("pointermove", deepest, { clientX: 10, clientY: 10 });

    const cursor = samples[0];
    expect(cursor?.anchors).toHaveLength(DEFAULT_MAX_ANCHORS);
    expect(cursor?.anchors.map((a) => a.id)).toEqual(["level-5", "level-4", "level-3", "level-2"]);

    handle.detach();
  });

  it("skips zero-size rects when building the chain", () => {
    const outer = document.createElement("div");
    const zeroSize = document.createElement("div");
    outer.appendChild(zeroSize);
    document.body.appendChild(outer);

    mockRect(outer, { left: 0, top: 0, width: 200, height: 100 });
    mockRect(zeroSize, { left: 0, top: 0, width: 0, height: 0 });

    registry.register("outer", outer);
    registry.register("zero", zeroSize);

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

    firePointerEvent("pointermove", zeroSize, { clientX: 10, clientY: 10 });

    const cursor = samples[0];
    expect(cursor?.anchors.map((a) => a.id)).toEqual(["outer"]);

    handle.detach();
  });

  it("computes the viewport fallback as clientX/innerWidth, clientY/innerHeight", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    mockRect(el, { left: 0, top: 0, width: 0, height: 0 });

    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

    firePointerEvent("pointermove", el, { clientX: 100, clientY: 50 });

    const cursor = samples[0];
    expect(cursor?.viewport?.u).toBeCloseTo(100 / window.innerWidth);
    expect(cursor?.viewport?.v).toBeCloseTo(50 / window.innerHeight);

    handle.detach();
  });

  it("publishes cursor: null on document pointerleave", () => {
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

    firePointerEvent("pointerleave", document.documentElement, { clientX: 0, clientY: 0 });

    expect(samples.at(-1)).toBeNull();
    handle.detach();
  });

  it("publishes cursor: null on window blur", () => {
    const { client, samples } = makeClient();
    const handle = attachPointerSource(client, registry);

    window.dispatchEvent(new Event("blur"));

    expect(samples.at(-1)).toBeNull();
    handle.detach();
  });

  it("registers its teardown with the client and detach() removes listeners", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    mockRect(el, { left: 0, top: 0, width: 100, height: 100 });
    registry.register("a", el);

    const { client, samples } = makeClient();
    attachPointerSource(client, registry);

    client.dispose(); // should invoke the registered teardown (detach)
    samples.length = 0;
    firePointerEvent("pointermove", el, { clientX: 10, clientY: 10 });
    expect(samples).toHaveLength(0);
  });
});

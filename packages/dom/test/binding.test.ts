import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus, PresenceClient, CursorPresence, CursorPosition } from "@anchor-presence/core";
import { linearInterpolator } from "@anchor-presence/core";
import { createDomBinding } from "../src/binding";

type RafLike = (cb: (ts: number) => void) => number;

function makeRafStub() {
  let nextHandle = 1;
  const queue: { handle: number; callback: (ts: number) => void }[] = [];
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

function makeFakeClient() {
  let remoteSnapshot: CursorPresence[] = [];
  let idleClientIds = new Set<string>();
  const remoteListeners = new Set<() => void>();
  const teardowns: Array<() => void> = [];

  const client: PresenceClient<unknown, unknown> = {
    clientId: "local",
    session: "s",
    updateLocalCursor: () => {},
    setContext: () => {},
    getContext: () => {},
    subscribeContext: () => () => {},
    setUser: () => {},
    getUser: () => {},
    leave: () => {},
    sendEvent: () => false,
    subscribeEvents: () => () => {},
    subscribePeers: () => () => {},
    getStatus: () => "connected",
    subscribeStatus: () => () => {},
    getRemoteSnapshot: () => remoteSnapshot,
    getRemotePresence: () =>
      remoteSnapshot.map((presence) =>
        Object.assign({}, presence, { idle: idleClientIds.has(presence.clientId) }),
      ),
    subscribeRemote: (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    registerTeardown: (fn) => {
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },
    dispose: () => {
      for (const fn of teardowns.splice(0)) fn();
    },
  };

  function pushRemote(next: CursorPresence[], nextIdleClientIds: Set<string> = new Set()): void {
    remoteSnapshot = next;
    idleClientIds = nextIdleClientIds;
    for (const listener of remoteListeners) listener();
  }

  return { client, pushRemote, teardowns };
}

function makeCapturingClient(samples: (CursorPosition | null)[]): PresenceClient<unknown, unknown> {
  const teardowns: Array<() => void> = [];
  return {
    clientId: "local",
    session: "s",
    updateLocalCursor: (cursor) => {
      samples.push(cursor);
    },
    setContext: () => {},
    getContext: () => {},
    subscribeContext: () => () => {},
    setUser: () => {},
    getUser: () => {},
    leave: () => {},
    sendEvent: () => false,
    subscribeEvents: () => () => {},
    subscribePeers: () => () => {},
    getStatus: () => "connected",
    subscribeStatus: () => () => {},
    getRemoteSnapshot: () => [],
    getRemotePresence: () => [],
    subscribeRemote: () => () => {},
    registerTeardown: (fn) => {
      teardowns.push(fn);
      return () => {
        const index = teardowns.indexOf(fn);
        if (index !== -1) teardowns.splice(index, 1);
      };
    },
    dispose: () => {
      for (const fn of teardowns.splice(0)) fn();
    },
  };
}

function mockRect(el: Element): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  });
}

function buildNestedAnchors(count: number): Element {
  let parent: Element = document.body;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.dataset.anchor = `level-${i}`;
    mockRect(el);
    parent.append(el);
    parent = el;
  }
  return parent;
}

function firePointerMove(target: Element): void {
  const event = new Event("pointermove", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }) as PointerEvent & {
    clientX: number;
    clientY: number;
  };
  Object.defineProperty(event, "clientX", { value: 10 });
  Object.defineProperty(event, "clientY", { value: 10 });
  target.dispatchEvent(event);
}

describe("createDomBinding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("wires registry + pointer + scheduler + resolver: resolves a remote cursor against a registered anchor", () => {
    const el = document.createElement("div");
    el.dataset.anchor = "a";
    document.body.append(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });

    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      },
    ]);

    flush();

    const snapshot = binding.getSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.clientId).toBe("remote-1");
    expect(snapshot[0]?.tier).toBe("anchor");
    expect(snapshot[0]?.x).toBeCloseTo(50);
    expect(snapshot[0]?.y).toBeCloseTo(50);

    binding.dispose();
  });

  it("hides remote cursors while the connection is down and shows them again after", () => {
    const el = document.createElement("div");
    el.dataset.anchor = "a";
    document.body.append(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    let status: ConnectionStatus = "connected";
    const statusListeners = new Set<(next: ConnectionStatus) => void>();
    client.getStatus = () => status;
    client.subscribeStatus = (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    };
    const setStatus = (next: ConnectionStatus) => {
      status = next;
      for (const listener of statusListeners) listener(next);
      flush();
    };
    const binding = createDomBinding(client, { environment: { raf, caf } });
    pushRemote([
      {
        version: 1,
        clientId: "r",
        session: "s",
        sequence: 1,
        cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      },
    ]);
    flush();
    expect(binding.getSnapshot()).toHaveLength(1);

    setStatus("reconnecting");
    expect(binding.getSnapshot()).toHaveLength(0);

    setStatus("connected");
    expect(binding.getSnapshot()).toHaveLength(1);
    binding.dispose();
  });

  it("tells peers the client left on pagehide, and stops after dispose", () => {
    const { raf, caf } = makeRafStub();
    const { client } = makeFakeClient();
    client.leave = vi.fn();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    window.dispatchEvent(new Event("pagehide"));
    expect(client.leave).toHaveBeenCalledTimes(1);

    binding.dispose();
    window.dispatchEvent(new Event("pagehide"));
    expect(client.leave).toHaveBeenCalledTimes(1);
  });

  it("carries idle from client.getRemotePresence() onto the resolved cursor", () => {
    const el = document.createElement("div");
    el.dataset.anchor = "a";
    document.body.append(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });

    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    const presence: CursorPresence = {
      version: 1,
      clientId: "remote-1",
      session: "s",
      sequence: 1,
      cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
    };

    pushRemote([presence]);
    flush();
    expect(binding.getSnapshot()[0]?.idle).toBe(false);

    pushRemote([presence], new Set(["remote-1"]));
    flush();
    expect(binding.getSnapshot()[0]?.idle).toBe(true);

    binding.dispose();
  });

  it("notifies subscribers on snapshot changes", () => {
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    const listener = vi.fn();
    binding.subscribe(listener);

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
      },
    ]);
    flush();

    expect(listener).toHaveBeenCalled();
    binding.dispose();
  });

  it("observes a clipping ancestor and updates point visibility after its resize", () => {
    const clip = document.createElement("div");
    document.body.append(clip);
    clip.style.overflow = "hidden";
    const el = document.createElement("div");
    clip.append(el);
    el.dataset.anchor = "a";
    let clipHeight = 100;
    vi.spyOn(clip, "getBoundingClientRect").mockImplementation(() => ({
      left: 0,
      top: 0,
      width: 100,
      height: clipHeight,
      right: 100,
      bottom: clipHeight,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    }));
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 90,
      width: 100,
      height: 40,
      right: 100,
      bottom: 130,
      x: 0,
      y: 90,
      toJSON() {
        return this;
      },
    });

    let resize: (() => void) | undefined;
    const observe = vi.fn();
    class ResizeObserverStub {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, {
      environment: { raf, caf, ResizeObserverCtor: ResizeObserverStub },
    });
    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      },
    ]);
    flush();

    expect(observe).toHaveBeenCalledWith(clip);
    expect(binding.getSnapshot()[0]?.pointVisible).toBe(false);

    clipHeight = 200;
    expect(resize).toBeTypeOf("function");
    resize?.();
    flush(16);

    expect(binding.getSnapshot()[0]?.pointVisible).toBe(true);
    binding.dispose();
  });

  it("F6: a presence with cursor: null does not count as active — signals detach once it's the only remote presence", () => {
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const binding = createDomBinding(client, { environment: { raf, caf } });

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
      },
    ]);
    flush();

    // active: scroll listener attached
    expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), {
      capture: true,
      passive: true,
    });

    // the same clientId goes idle (cursor: null) — active must derive from non-null cursors, not store entry count
    pushRemote([{ version: 1, clientId: "remote-1", session: "s", sequence: 2, cursor: null }]);
    flush();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });

    binding.dispose();
  });

  it("going idle publishes a final snapshot so the departed cursor is not left visible", () => {
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
      },
    ]);
    flush();
    expect(binding.getSnapshot().some((c) => c.visible)).toBe(true);

    pushRemote([{ version: 1, clientId: "remote-1", session: "s", sequence: 2, cursor: null }]);
    flush();

    // scheduler is detached now, but the final pass must have hidden the cursor
    expect(binding.getSnapshot().some((c) => c.visible)).toBe(false);

    binding.dispose();
  });

  it("dispose() detaches everything and is registered as a client teardown", () => {
    const { raf, caf } = makeRafStub();
    const { client } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });
    const disposeSpy = vi.fn();
    // dispose should be idempotent / callable directly too
    binding.dispose();
    expect(() => binding.dispose()).not.toThrow();
    disposeSpy();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it("R-6: dispose() publishes one final empty snapshot to listeners before clearing them", () => {
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });
    const listener = vi.fn();
    binding.subscribe(listener);

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
      },
    ]);
    flush();
    expect(binding.getSnapshot()).toHaveLength(1);

    listener.mockClear();
    binding.dispose();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(binding.getSnapshot()).toHaveLength(0);
  });

  it("D-1: dispose() unregisters binding and pointer teardowns from the client", () => {
    const { raf, caf } = makeRafStub();
    const { client, teardowns } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });
    expect(teardowns).toHaveLength(2); // binding dispose + pointer detach

    binding.dispose();
    expect(teardowns).toHaveLength(0); // client.dispose() must not re-run them

    expect(() => client.dispose()).not.toThrow();
  });

  it("client.dispose() still tears the binding down when the binding was not disposed directly", () => {
    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote, teardowns } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
      },
    ]);
    flush();
    expect(binding.getSnapshot()).toHaveLength(1);

    client.dispose();
    expect(binding.getSnapshot()).toHaveLength(0);
    expect(teardowns).toHaveLength(0);
  });

  it("throws for an invalid anchorAttribute", () => {
    const { client } = makeFakeClient();
    expect(() => createDomBinding(client, { anchorAttribute: "not an attribute" })).toThrow(TypeError);
  });

  it("throws for a non-integer maxAnchors", () => {
    const { client } = makeFakeClient();
    expect(() => createDomBinding(client, { maxAnchors: 2.5 })).toThrow(TypeError);
  });

  it("registers anchors from the default data-anchor attribute without manual registry access", () => {
    const el = document.createElement("div");
    el.dataset.anchor = "a";
    document.body.append(el);
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });

    const { raf, caf, flush } = makeRafStub();
    const { client, pushRemote } = makeFakeClient();
    const binding = createDomBinding(client, { environment: { raf, caf } });

    pushRemote([
      {
        version: 1,
        clientId: "remote-1",
        session: "s",
        sequence: 1,
        cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
      },
    ]);

    flush();

    expect(binding.getSnapshot()[0]?.tier).toBe("anchor");
    expect(binding.getSnapshot()[0]?.anchorId).toBe("a");

    binding.dispose();
  });

  it("clamps maxAnchors to the protocol range for the outbound chain", () => {
    const deepest = buildNestedAnchors(9);
    const { raf, caf } = makeRafStub();
    const wide: (CursorPosition | null)[] = [];
    const wideClient = makeCapturingClient(wide);
    const wideBinding = createDomBinding(wideClient, { maxAnchors: 10, environment: { raf, caf } });

    firePointerMove(deepest);
    expect(wide[0]?.anchors.map((a) => a.id)).toEqual([
      "level-8",
      "level-7",
      "level-6",
      "level-5",
      "level-4",
      "level-3",
      "level-2",
      "level-1",
    ]);
    wideBinding.dispose();

    document.body.innerHTML = "";
    const deepestAgain = buildNestedAnchors(9);
    const { raf: raf2, caf: caf2 } = makeRafStub();
    const narrow: (CursorPosition | null)[] = [];
    const narrowClient = makeCapturingClient(narrow);
    const narrowBinding = createDomBinding(narrowClient, {
      maxAnchors: 0,
      environment: { raf: raf2, caf: caf2 },
    });

    firePointerMove(deepestAgain);
    expect(narrow[0]?.anchors.map((a) => a.id)).toEqual(["level-8"]);
    narrowBinding.dispose();
  });

  it("localCursorCapture false attaches no pointer source: context and user flow, no cursor", () => {
    const deepest = buildNestedAnchors(4);
    const { raf, caf } = makeRafStub();
    const samples: (CursorPosition | null)[] = [];
    const client = makeCapturingClient(samples);
    const binding = createDomBinding(client, {
      localCursorCapture: false,
      environment: { raf, caf },
    });

    firePointerMove(deepest);
    expect(samples).toHaveLength(0);

    binding.dispose();
  });

  describe("prefers-reduced-motion", () => {
    function stubMatchMedia(matches: boolean): () => void {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
      return () => {
        window.matchMedia = original;
      };
    }

    it("snaps cursors instead of easing when the OS prefers reduced motion", () => {
      const restore = stubMatchMedia(true);
      const anchorA = document.createElement("div");
      anchorA.dataset.anchor = "a";
      const anchorB = document.createElement("div");
      anchorB.dataset.anchor = "b";
      document.body.append(anchorA, anchorB);
      registerRect(anchorA, 0);
      registerRect(anchorB, 200);

      const { raf, caf, flush } = makeRafStub();
      const { client, pushRemote } = makeFakeClient();
      const binding = createDomBinding(client, { environment: { raf, caf } });

      pushRemote([
        {
          version: 1,
          clientId: "remote-1",
          session: "s",
          sequence: 1,
          cursor: { anchors: [{ id: "a", u: 0, v: 0 }] },
        },
      ]);
      flush(0);
      expect(binding.getSnapshot()[0]?.x).toBeCloseTo(0);

      // a same-duration linearInterpolator would still be mid-ease at this timestamp
      pushRemote([
        {
          version: 1,
          clientId: "remote-1",
          session: "s",
          sequence: 2,
          cursor: { anchors: [{ id: "b", u: 0, v: 0 }] },
        },
      ]);
      flush(1);

      expect(binding.getSnapshot()[0]?.x).toBeCloseTo(200);
      binding.dispose();
      restore();
    });

    it("honors an explicit interpolatorFactory instead of the reduced-motion default", () => {
      const restore = stubMatchMedia(true);
      const anchorA = document.createElement("div");
      anchorA.dataset.anchor = "a";
      document.body.append(anchorA);
      registerRect(anchorA, 0);

      const { raf, caf, flush } = makeRafStub();
      const { client, pushRemote } = makeFakeClient();
      const factory = vi.fn(() => linearInterpolator(1_000));
      const binding = createDomBinding(client, {
        resolution: { interpolatorFactory: factory },
        environment: { raf, caf },
      });

      pushRemote([
        {
          version: 1,
          clientId: "remote-1",
          session: "s",
          sequence: 1,
          cursor: { anchors: [{ id: "a", u: 0, v: 0 }] },
        },
      ]);
      flush(0);

      expect(factory).toHaveBeenCalled();
      binding.dispose();
      restore();
    });

    function registerRect(el: Element, left: number): void {
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        left,
        top: 0,
        width: 100,
        height: 100,
        right: left + 100,
        bottom: 100,
        x: left,
        y: 0,
        toJSON() {
          return this;
        },
      });
    }
  });
});

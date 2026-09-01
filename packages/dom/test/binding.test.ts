import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PresenceClient, CursorPresence } from "@anchor-presence/core";
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
    const pending = queue.splice(0, queue.length);
    for (const entry of pending) entry.callback(ts);
  }
  return { raf, caf, queue, flush };
}

function makeFakeClient() {
  let remoteSnapshot: CursorPresence[] = [];
  const remoteListeners = new Set<() => void>();
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
    getRemoteSnapshot: () => remoteSnapshot,
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
      for (const fn of teardowns.splice(0, teardowns.length)) fn();
    },
  };

  function pushRemote(next: CursorPresence[]): void {
    remoteSnapshot = next;
    for (const listener of remoteListeners) listener();
  }

  return { client, pushRemote, teardowns };
}

describe("createDomBinding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("wires registry + pointer + scheduler + resolver: resolves a remote cursor against a registered anchor", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
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

    binding.registry.register("a", el);

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
    const clip = document.body.appendChild(document.createElement("div"));
    clip.style.overflow = "hidden";
    const el = clip.appendChild(document.createElement("div"));
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
    const binding = createDomBinding(client, { environment: { raf, caf, ResizeObserverCtor: ResizeObserverStub } });
    binding.registry.register("a", el);
    pushRemote([{
      version: 1,
      clientId: "remote-1",
      session: "s",
      sequence: 1,
      cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
    }]);
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
    expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true, passive: true });

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
});

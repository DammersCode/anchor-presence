import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import type { CursorPosition, PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "../src/index";
import { createAnchorRegistry } from "../src/registry";
import { attachPointerSource } from "../src/pointer";

function move(target: Element, type = "pointermove"): void {
  const event = new Event(type, { bubbles: true, composed: true });
  Object.defineProperty(event, "clientX", { value: 10 });
  Object.defineProperty(event, "clientY", { value: 10 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

function setup(options: { privateAttribute?: string; captureFocus?: boolean } = {}) {
  const samples: (CursorPosition | null)[] = [];
  const client = {
    setLocalCursor: (cursor: CursorPosition | null) => samples.push(cursor),
    registerTeardown: () => () => {},
  } as unknown as PresenceClient;
  const handle = attachPointerSource(client, createAnchorRegistry(), { maxAnchors: 4, ...options });
  return { samples, handle };
}

describe("pointer privacy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears the cursor over an element with data-anchor-private", () => {
    const secret = document.createElement("div");
    secret.dataset.anchorPrivate = "";
    document.body.append(secret);
    const { samples, handle } = setup();
    move(secret);
    expect(samples).toEqual([null]);
    handle.detach();
  });

  it("clears the cursor over a child of a private element", () => {
    document.body.innerHTML = `<div data-anchor-private><span><b id="c"></b></span></div>`;
    const { samples, handle } = setup();
    move(document.querySelector("#c")!);
    expect(samples).toEqual([null]);
    handle.detach();
  });

  it("clears the cursor over a private element inside a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div data-anchor-private><i id="deep"></i></div>`;
    const { samples, handle } = setup();
    move(shadow.querySelector("#deep")!);
    expect(samples).toEqual([null]);
    handle.detach();
  });

  it("sends a cursor again after the pointer leaves the private area", () => {
    document.body.innerHTML = `<div data-anchor-private id="p"></div><div id="open"></div>`;
    const { samples, handle } = setup();
    move(document.querySelector("#p")!);
    move(document.querySelector("#p")!);
    move(document.querySelector("#open")!);
    expect(samples.length).toBe(2);
    expect(samples[0]).toBeNull();
    expect(samples[1]).not.toBeNull();
    handle.detach();
  });

  it("does not affect an element without the attribute", () => {
    const open = document.createElement("div");
    document.body.append(open);
    const { samples, handle } = setup();
    move(open);
    expect(samples[0]).not.toBeNull();
    handle.detach();
  });

  it("uses a custom privateAttribute and ignores the default one", () => {
    document.body.innerHTML = `<div data-hide id="a"></div><div data-anchor-private id="b"></div>`;
    const { samples, handle } = setup({ privateAttribute: "data-hide" });
    move(document.querySelector("#a")!);
    move(document.querySelector("#b")!);
    expect(samples[0]).toBeNull();
    expect(samples[1]).not.toBeNull();
    handle.detach();
  });

  it("clears the cursor when focus enters a private subtree", () => {
    document.body.innerHTML = `<div data-anchor-private><input id="f" /></div><button id="ok"></button>`;
    const { samples, handle } = setup({ captureFocus: true });
    const focus = (el: Element) => el.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
    const input = document.querySelector("#f")!;
    Object.defineProperty(input, "getBoundingClientRect", {
      value: () => ({ width: 10, height: 10, left: 0, top: 0 }),
    });
    focus(input);
    expect(samples).toEqual([null]);
    handle.detach();
  });

  it("clears the cursor when focus enters a private element inside a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div data-anchor-private><input id="deep" /></div>`;
    const { samples, handle } = setup({ captureFocus: true });
    shadow.querySelector("#deep")!.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
    expect(samples).toEqual([null]);
    handle.detach();
  });

  it("throws a TypeError for an invalid privateAttribute", () => {
    const { a: transport } = createInMemoryPair();
    const client = createPresenceClient({ transport });
    expect(() => createDomBinding(client, { privateAttribute: "data_private" })).toThrow(TypeError);
    createDomBinding(client, { privateAttribute: "data-hide" }).dispose();
    client.dispose();
  });
});

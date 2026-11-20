import { afterEach, expect, it, vi } from "vitest";
import { createSignalHub } from "../src/internal/signals";

afterEach(() => {
  vi.useRealTimers();
});

it("detach clears the safety timer of an open transition", () => {
  vi.useFakeTimers();
  const onInvalidate = vi.fn();
  const hub = createSignalHub({
    doc: document,
    win: window,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle),
    markerAttribute: "data-test",
    onInvalidate,
  });
  hub.attach();
  const el = document.createElement("div");
  document.body.append(el);
  el.dispatchEvent(Object.assign(new Event("transitionrun", { bubbles: true }), { propertyName: "left" }));
  expect(hub.hasOpenTransitions()).toBe(true);
  expect(vi.getTimerCount()).toBe(1);

  hub.detach();

  expect(vi.getTimerCount()).toBe(0);
  expect(hub.hasOpenTransitions()).toBe(false);
  el.remove();
});

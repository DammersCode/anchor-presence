import { describe, expect, it } from "vitest";
import type { CursorPresence } from "@anchor-presence/core";
import type { ResolutionTier } from "@anchor-presence/dom";
import { createVisibilityPolicy } from "./visibilityPolicy";
import type { LocalViewState } from "./visibilityPolicy";
import type { DemoContext } from "./setup";

function presence(context?: DemoContext): CursorPresence<DemoContext> {
  return {
    version: 1,
    clientId: "remote-1",
    session: "s",
    sequence: 1,
    cursor: { anchors: [{ id: "a", u: 0.5, v: 0.5 }] },
    ...(context !== undefined ? { context } : {}),
  };
}

function resolution(tier: ResolutionTier, pointVisible = true) {
  return { tier, anchorId: tier === "anchor" ? "a" : null, pointVisible };
}

function policyFor(state: LocalViewState) {
  return createVisibilityPolicy(() => state);
}

describe("createVisibilityPolicy", () => {
  it("hides the hidden tier", () => {
    const policy = policyFor({ page: "dashboard", settingsOpen: false });
    expect(policy({ presence: presence(), resolution: resolution("hidden", false) })).toBe("hide");
  });

  it("hides an anchored cursor whose point is clipped out of view", () => {
    const policy = policyFor({ page: "dashboard", settingsOpen: false });
    expect(policy({ presence: presence(), resolution: resolution("anchor", false) })).toBe("hide");
  });

  it("shows a viewport-tier cursor with no context", () => {
    const policy = policyFor({ page: "dashboard", settingsOpen: false });
    expect(policy({ presence: presence(), resolution: resolution("viewport") })).toBe("show");
  });

  it("hides a remote cursor in the settings dialog while the local dialog is closed", () => {
    const policy = policyFor({ page: "dashboard", settingsOpen: false });
    const remote = presence({ page: "dashboard", dialog: "settings" });
    expect(policy({ presence: remote, resolution: resolution("anchor") })).toBe("hide");
  });

  it("shows that cursor once the local dialog opens", () => {
    const policy = policyFor({ page: "dashboard", settingsOpen: true });
    const remote = presence({ page: "dashboard", dialog: "settings" });
    expect(policy({ presence: remote, resolution: resolution("anchor") })).toBe("show");
  });

  it("hides a cursor on a different page", () => {
    const policy = policyFor({ page: "orders", settingsOpen: false });
    expect(policy({ presence: presence({ page: "dashboard" }), resolution: resolution("anchor") })).toBe("hide");
  });

  it("shows a cursor on the same page", () => {
    const policy = policyFor({ page: "orders", settingsOpen: false });
    expect(policy({ presence: presence({ page: "orders" }), resolution: resolution("anchor") })).toBe("show");
  });

  it("shows a cursor while the local page is still unknown", () => {
    const policy = policyFor({ page: null, settingsOpen: false });
    expect(policy({ presence: presence({ page: "dashboard" }), resolution: resolution("anchor") })).toBe("show");
  });

  it("reads the current local state on every call", () => {
    const state: LocalViewState = { page: "dashboard", settingsOpen: false };
    const policy = policyFor(state);
    const remote = presence({ page: "orders" });

    expect(policy({ presence: remote, resolution: resolution("anchor") })).toBe("hide");
    state.page = "orders";
    expect(policy({ presence: remote, resolution: resolution("anchor") })).toBe("show");
  });
});

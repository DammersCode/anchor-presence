import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PresenceProvider, createPresenceHooks, usePresenceClient } from "../src/index";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

it("warns once when a package hook runs under a createPresenceHooks provider", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const hooks = createPresenceHooks();
  const { client } = makeFakeClient();
  const { binding } = makeFakeBinding();
  const seen: unknown[] = [];
  function Probe() {
    seen.push(usePresenceClient(), hooks.usePresenceClient());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <hooks.PresenceProvider client={client} binding={binding}>
        <Probe />
      </hooks.PresenceProvider>,
    ),
  );
  act(() =>
    root.render(
      <PresenceProvider client={client} binding={binding}>
        <Probe />
      </PresenceProvider>,
    ),
  );
  act(() => root.unmount());
  const mixups = warn.mock.calls.filter(([text]) => String(text).includes("same call"));
  expect(mixups).toHaveLength(1);
  expect(seen[0]).toBeNull();
  warn.mockRestore();
});

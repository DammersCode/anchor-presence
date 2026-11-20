import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PresenceProvider } from "../src/provider";
import { CursorLayer } from "../src/cursor";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

it("lets a consumer transition replace the default", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const { client } = makeFakeClient();
  const { binding, publish } = makeFakeBinding();
  const root = createRoot(container);
  act(() => {
    root.render(
      <PresenceProvider client={client} binding={binding}>
        <CursorLayer getCursorProps={() => ({ style: { transition: "none" } })} />
      </PresenceProvider>,
    );
  });
  act(() => {
    publish([
      {
        clientId: "r1",
        x: 1,
        y: 2,
        visible: true,
        pointVisible: true,
        anchorId: "a",
        tier: "anchor",
        idle: false,
      },
    ]);
  });
  const el = container.querySelector("[data-anchor-presence-cursor]") as HTMLElement;
  expect(el.style.transition).toBe("none");
  act(() => root.unmount());
  container.remove();
});

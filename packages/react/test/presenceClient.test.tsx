import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PresenceClient } from "@anchor-presence/core";
import { usePresenceClient } from "../src/hooks";
import { makeFakeClient } from "./testUtils";

describe("usePresenceClient", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("runs the factory once per key and returns the same instance across renders", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: PresenceClient[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "memo" }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(<Comp />);
    });
    act(() => {
      root.render(<Comp />);
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);

    act(() => root.unmount());
  });

  it("runs the factory once under StrictMode and keeps the instance across the double mount", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: PresenceClient[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "strict" }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <StrictMode>
          <Comp />
        </StrictMode>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[1]).toBe(seen[0]);

    act(() => root.unmount());
  });

  it("resolves the same instance for two components without a key", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seenA: PresenceClient[] = [];
    const seenB: PresenceClient[] = [];
    function A() {
      seenA.push(usePresenceClient({ factory }));
      return null;
    }
    function B() {
      seenB.push(usePresenceClient({ factory }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <A />
          <B />
        </>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seenA[0]).toBe(seenB[0]);

    act(() => root.unmount());
  });

  it("creates distinct instances for different keys", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: PresenceClient[] = [];
    function Comp(props: { clientKey: string }) {
      seen.push(usePresenceClient({ factory, key: props.clientKey }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <Comp clientKey="k-a" />
          <Comp clientKey="k-b" />
        </>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(seen[0]).not.toBe(seen[1]);

    act(() => root.unmount());
  });

  it("dispose() clears the registry entry so the next render re-creates the client", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: PresenceClient[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "recreate" }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(<Comp />);
    });
    const before = seen[0]!;

    act(() => {
      before.dispose();
    });
    act(() => {
      root.render(<Comp />);
    });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(seen[1]).toBeDefined();
    expect(seen[1]).not.toBe(before);

    act(() => root.unmount());
  });

  it("keeps a stable instance across server renders", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: PresenceClient[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "ssr" }));
      return null;
    }

    renderToString(<Comp />);
    renderToString(<Comp />);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seen[1]).toBe(seen[0]);
  });
});

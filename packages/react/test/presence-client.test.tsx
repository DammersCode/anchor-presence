import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PresenceClient } from "@anchor-presence/core";
import { usePresenceClient } from "../src/hooks";
import { makeFakeClient } from "./test-utils";

describe("usePresenceClient", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("returns null before the effect and the stable client after, with one factory call", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
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
    expect(seen[0]).toBeNull();
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).toBe(last);

    act(() => root.unmount());
  });

  it("runs the factory once under StrictMode and keeps the instance across the double mount", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
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
    expect(seen[0]).toBeNull();
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).toBe(last);

    act(() => root.unmount());
  });

  it("resolves the same instance for two components without a key", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seenA: (PresenceClient | null)[] = [];
    const seenB: (PresenceClient | null)[] = [];
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
    expect(seenA[0]).toBeNull();
    expect(seenB[0]).toBeNull();
    expect(seenA.at(-1)).toBe(seenB.at(-1));
    expect(seenA.at(-1)).not.toBeNull();

    act(() => root.unmount());
  });

  it("creates distinct instances for different keys", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
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
    expect(seen[0]).toBeNull();
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).not.toBeNull();
    expect(last).not.toBe(seen.at(-2));

    act(() => root.unmount());
  });

  it("dispose() clears the registry entry so the next render re-creates the client", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "recreate" }));
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(<Comp />);
    });
    const before = seen[1]!;
    expect(before).not.toBeNull();

    act(() => {
      before.dispose();
    });
    act(() => {
      root.render(<Comp />);
    });

    expect(factory).toHaveBeenCalledTimes(2);
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(last).not.toBe(before);

    act(() => root.unmount());
  });

  it("server renders return null and never run the factory", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(usePresenceClient({ factory, key: "ssr" }));
      return null;
    }

    renderToString(<Comp />);
    renderToString(<Comp />);

    expect(factory).not.toHaveBeenCalled();
    expect(seen).toEqual([null, null]);
  });
});

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PresenceClient } from "@anchor-presence/core";
import { LiveCursorProvider, useCursorClient } from "../src";
import { makeFakeClient } from "./test-utils";

describe("LiveCursorProvider factory", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("creates the client in a mount effect, null before, same instance across renders", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(useCursorClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider factory={factory}>
          <Comp />
        </LiveCursorProvider>,
      );
    });
    act(() => {
      root.render(
        <LiveCursorProvider factory={factory}>
          <Comp />
        </LiveCursorProvider>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seen[0]).toBeNull();
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).toBe(last);

    act(() => root.unmount());
  });

  it("disposes the client it created on unmount and not before", () => {
    const fake = makeFakeClient();
    const disposeSpy = vi.spyOn(fake.client, "dispose");
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider factory={() => fake.client}>
          <div />
        </LiveCursorProvider>,
      );
    });
    expect(disposeSpy).not.toHaveBeenCalled();

    act(() => root.unmount());
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("lets a client prop win: the factory never runs and the client is not disposed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = makeFakeClient();
    const disposeSpy = vi.spyOn(fake.client, "dispose");
    const factory = vi.fn(() => makeFakeClient().client);
    const root = createRoot(container);

    act(() => {
      root.render(
        // @ts-expect-error the types forbid factory with client; the runtime still lets client win
        <LiveCursorProvider factory={factory} client={fake.client}>
          <div />
        </LiveCursorProvider>,
      );
    });

    expect(factory).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([text]) => String(text).includes("both `client` and `factory`"))).toBe(true);
    warn.mockRestore();
  });

  it("an explicit client null skips the factory", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(useCursorClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        // @ts-expect-error the types forbid factory with client; the runtime still lets client win
        <LiveCursorProvider factory={factory} client={null}>
          <Comp />
        </LiveCursorProvider>,
      );
    });

    expect(factory).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();

    act(() => root.unmount());
  });

  it("creates-disposes-creates under StrictMode and leaves one live client", () => {
    const live: PresenceClient[] = [];
    const factory = vi.fn(() => {
      const client = makeFakeClient().client;
      live.push(client);
      vi.spyOn(client, "dispose").mockImplementation(() => {
        live.splice(live.indexOf(client), 1);
      });
      return client;
    });
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(useCursorClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <StrictMode>
          <LiveCursorProvider factory={factory}>
            <Comp />
          </LiveCursorProvider>
        </StrictMode>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(live).toHaveLength(1);
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).toBe(last);

    act(() => root.unmount());
    expect(live).toHaveLength(0);
  });

  it("server renders run no factory and provide a null client", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(useCursorClient());
      return null;
    }

    renderToString(
      <LiveCursorProvider factory={factory}>
        <Comp />
      </LiveCursorProvider>,
    );

    expect(factory).not.toHaveBeenCalled();
    expect(seen).toEqual([null]);
  });
});

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PresenceClient } from "@dammers/anchor-presence-core";
import { PresenceProvider, usePresenceClient, usePresenceStatus } from "../src";
import { makeFakeClient } from "./test-utils";

describe("PresenceProvider factory", () => {
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
      seen.push(usePresenceClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider factory={factory}>
          <Comp />
        </PresenceProvider>,
      );
    });
    act(() => {
      root.render(
        <PresenceProvider factory={factory}>
          <Comp />
        </PresenceProvider>,
      );
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(seen[0]).toBeNull();
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(seen.at(-2)).toBe(last);

    act(() => root.unmount());
  });

  it("reports connecting until the factory client exists, then the client status", () => {
    const fake = makeFakeClient();
    const seen: string[] = [];
    function Comp() {
      seen.push(usePresenceStatus());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider factory={() => fake.client}>
          <Comp />
        </PresenceProvider>,
      );
    });

    expect(seen[0]).toBe("connecting");
    expect(seen.at(-1)).toBe(fake.client.getStatus());
    act(() => root.unmount());
  });

  it("disposes the client it created on unmount and not before", () => {
    const fake = makeFakeClient();
    const disposeSpy = vi.spyOn(fake.client, "dispose");
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider factory={() => fake.client}>
          <div />
        </PresenceProvider>,
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
        <PresenceProvider factory={factory} client={fake.client}>
          <div />
        </PresenceProvider>,
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
      seen.push(usePresenceClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        // @ts-expect-error the types forbid factory with client; the runtime still lets client win
        <PresenceProvider factory={factory} client={null}>
          <Comp />
        </PresenceProvider>,
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
      seen.push(usePresenceClient());
      return null;
    }
    const root = createRoot(container);

    act(() => {
      root.render(
        <StrictMode>
          <PresenceProvider factory={factory}>
            <Comp />
          </PresenceProvider>
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

  it("throws a clear TypeError when factory is a client object", () => {
    const { client } = makeFakeClient();
    const root = createRoot(container);
    const errors: unknown[] = [];
    const listener = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", listener);
    try {
      act(() => {
        root.render(<PresenceProvider factory={client as never} />);
      });
    } catch (error) {
      errors.push(error);
    } finally {
      window.removeEventListener("error", listener);
    }
    expect(String(errors[0])).toMatch(/factory must be a function that returns a client/u);
  });

  it("server renders run no factory and provide a null client", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const seen: (PresenceClient | null)[] = [];
    function Comp() {
      seen.push(usePresenceClient());
      return null;
    }

    renderToString(
      <PresenceProvider factory={factory}>
        <Comp />
      </PresenceProvider>,
    );

    expect(factory).not.toHaveBeenCalled();
    expect(seen).toEqual([null]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPresenceClient } from "@anchor-presence/core";
import type { LiveCursorTransport } from "@anchor-presence/core";
import { LiveCursorProvider } from "../src/provider";
import { useCursorContext } from "../src/hooks";
import { makeFakeBinding } from "./testUtils";

type TestContext = { route: string };

function makeStubTransport(): LiveCursorTransport {
  return {
    send: () => {},
    subscribe: () => () => {},
  };
}

describe("useCursorContext", () => {
  let container: HTMLDivElement;
  let renders: (TestContext | undefined)[];
  let lastSetContext: ((next: TestContext | undefined) => void) | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    renders = [];
    lastSetContext = null;
  });

  afterEach(() => {
    container.remove();
  });

  function Reader() {
    const [context, setContext] = useCursorContext<TestContext>();
    renders.push(context);
    lastSetContext = setContext;
    return null;
  }

  it("returns the client's initial context option", () => {
    const client = createPresenceClient<TestContext>({
      transport: makeStubTransport(),
      context: { route: "/home" },
    });
    const { binding } = makeFakeBinding<TestContext, unknown>();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toEqual({ route: "/home" });

    act(() => {
      root.unmount();
    });
    client.dispose();
  });

  it("setContext via the hook updates both the client and the hook value", () => {
    const client = createPresenceClient<TestContext>({ transport: makeStubTransport() });
    const { binding } = makeFakeBinding<TestContext, unknown>();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toBeUndefined();

    act(() => {
      lastSetContext?.({ route: "/settings" });
    });
    expect(renders.at(-1)).toEqual({ route: "/settings" });
    expect(client.getContext()).toEqual({ route: "/settings" });

    act(() => {
      root.unmount();
    });
    client.dispose();
  });

  it("re-renders when the client's context is set directly, bypassing the hook", () => {
    const client = createPresenceClient<TestContext>({ transport: makeStubTransport() });
    const { binding } = makeFakeBinding<TestContext, unknown>();
    const root = createRoot(container);

    act(() => {
      root.render(
        <LiveCursorProvider client={client} binding={binding}>
          <Reader />
        </LiveCursorProvider>,
      );
    });
    expect(renders.at(-1)).toBeUndefined();

    act(() => {
      client.setContext({ route: "/external" });
    });
    expect(renders.at(-1)).toEqual({ route: "/external" });

    act(() => {
      client.setContext({ route: "/elsewhere" });
    });
    expect(renders.at(-1)).toEqual({ route: "/elsewhere" });

    act(() => {
      root.unmount();
    });
    client.dispose();
  });
});

describe("index re-exports", () => {
  const foreignTypes = [
    "ConnectionStatus",
    "CursorPresence",
    "PresenceClient",
    "DomBinding",
    "DomBindingOptions",
    "ResolutionTier",
    "ResolvedCursor",
  ];

  // type-only exports are erased at runtime; assert against the source (typecheck validates they resolve)
  it("re-exports the foreign types used in public signatures", () => {
    const source = readFileSync(join(process.cwd(), "packages/react/src/index.ts"), "utf8");
    for (const name of foreignTypes) {
      expect(source, `missing re-export of ${name}`).toMatch(new RegExp(`\\b${name}\\b`, "u"));
    }
  });
});

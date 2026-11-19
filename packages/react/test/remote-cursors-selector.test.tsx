import { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { PresenceProvider } from "../src/provider";
import { useRemoteCursorsSelector } from "../src/hooks";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function cursor(clientId: string, overrides: Partial<ResolvedCursor> = {}): ResolvedCursor {
  return {
    clientId,
    x: 1,
    y: 2,
    visible: true,
    pointVisible: true,
    anchorId: null,
    tier: "viewport",
    idle: false,
    ...overrides,
  };
}

const selectClientIds = (cursors: ResolvedCursor[]): string[] => cursors.map((c) => c.clientId);

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

describe("useRemoteCursorsSelector", () => {
  let container: HTMLDivElement;
  let renders: unknown[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    renders = [];
  });

  afterEach(() => {
    container.remove();
  });

  function CountReader() {
    const count = useRemoteCursorsSelector(useCallback((cursors: ResolvedCursor[]) => cursors.length, []));
    renders.push(count);
    return <div>{count}</div>;
  }

  function IdReader() {
    const ids = useRemoteCursorsSelector(selectClientIds, sameIds);
    renders.push(ids);
    return <div>{ids.join(",")}</div>;
  }

  it("returns the selected value and updates when it changes", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider client={client} binding={binding}>
          <CountReader />
        </PresenceProvider>,
      );
    });
    expect(renders.at(-1)).toBe(0);

    act(() => {
      publish([cursor("r1"), cursor("r2")]);
    });
    expect(renders.at(-1)).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it("does not rerender when the selected value is unchanged", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider client={client} binding={binding}>
          <CountReader />
        </PresenceProvider>,
      );
    });

    act(() => {
      publish([cursor("r1")]);
    });
    const afterFirst = renders.length;

    // a new snapshot array with the same cursor count: the selection is equal, so no rerender
    act(() => {
      publish([cursor("r1", { x: 99 })]);
    });

    expect(renders.length).toBe(afterFirst);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the previous reference when isEqual reports the selection unchanged", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider client={client} binding={binding}>
          <IdReader />
        </PresenceProvider>,
      );
    });

    act(() => {
      publish([cursor("r1")]);
    });
    const first = renders.at(-1);

    act(() => {
      publish([cursor("r1", { y: 42 })]);
    });

    expect(renders.at(-1)).toBe(first);

    act(() => {
      root.unmount();
    });
  });

  it("does not call select again for a snapshot probe on an unchanged cursors array", () => {
    const { client } = makeFakeClient();
    const { binding, publish, notify } = makeFakeBinding();
    const selectSpy = vi.fn((cursors: ResolvedCursor[]) => cursors.length);

    function Reader() {
      const count = useRemoteCursorsSelector(selectSpy);
      renders.push(count);
      return <div>{count}</div>;
    }

    const root = createRoot(container);
    act(() => {
      root.render(
        <PresenceProvider client={client} binding={binding}>
          <Reader />
        </PresenceProvider>,
      );
    });

    act(() => {
      publish([cursor("r1")]);
    });
    const callsAfterPublish = selectSpy.mock.calls.length;

    // the scheduler notifies subscribers every pass, even when the cursors array reference is unchanged
    act(() => {
      notify();
    });
    act(() => {
      notify();
    });

    expect(selectSpy.mock.calls.length).toBe(callsAfterPublish);

    act(() => {
      root.unmount();
    });
  });

  it("selects from an empty snapshot when no binding exists", () => {
    const { client } = makeFakeClient();
    const root = createRoot(container);

    act(() => {
      root.render(
        <PresenceProvider client={client}>
          <CountReader />
        </PresenceProvider>,
      );
    });

    expect(renders.at(-1)).toBe(0);
    expect(renders.length).toBeLessThan(10);

    act(() => {
      root.unmount();
    });
  });

  it("recomputes when select changes without a new snapshot", () => {
    const { client } = makeFakeClient();
    const fake = makeFakeBinding();
    fake.publish([cursor("a"), cursor("b")]);
    const seen: string[][] = [];
    let setOnlyA: (value: boolean) => void = () => {};

    function Probe() {
      const [onlyA, setState] = useState(false);
      setOnlyA = setState;
      const select = useCallback(
        (cursors: ResolvedCursor[]) =>
          cursors.filter((c) => !onlyA || c.clientId === "a").map((c) => c.clientId),
        [onlyA],
      );
      seen.push(useRemoteCursorsSelector(select, sameIds));
      return null;
    }

    act(() => {
      createRoot(container).render(
        <PresenceProvider client={client} binding={fake.binding}>
          <Probe />
        </PresenceProvider>,
      );
    });
    act(() => setOnlyA(true));

    expect(seen.at(-1)).toEqual(["a"]);
  });
});

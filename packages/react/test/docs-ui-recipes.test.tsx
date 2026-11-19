/* oxlint-disable react/hooks -- each copy takes its hooks from the createPresenceHooks result of its guide */
// Type-checked copies of the recipes in guides/card-occupancy.mdx, guides/join-leave-announcer.mdx and guides/typing-and-away.mdx.
import { useCallback, useEffect, useRef, useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceHooks, type PeerChange, type ResolvedCursor } from "../src/index";
import { docSample, missingLines, readRepoFile, trimLines } from "./doc-source";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

// card-occupancy.mdx

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };
type Context = { selection?: string[] };
type Groups = Record<string, string[]>;
type Placement = { anchorId: string; clientId: string };
type Cursor = ResolvedCursor<Context, User>;
const cardHooks = createPresenceHooks<Context, User>();

function group(placements: Placement[]): Groups {
  const groups: Groups = {};
  for (const { anchorId, clientId } of placements) (groups[anchorId] ??= []).push(clientId);
  for (const clientIds of Object.values(groups)) clientIds.sort();
  return groups;
}

function selectedIds(context: Context | undefined): string[] {
  const selection: unknown = context?.selection;
  return Array.isArray(selection) ? selection.filter((id): id is string => typeof id === "string") : [];
}

const whoIsOn = (cursors: readonly Cursor[]) =>
  group(
    cursors.flatMap(({ anchorId, clientId, visible }) =>
      visible && anchorId !== null ? [{ anchorId, clientId }] : [],
    ),
  );

const whoPicked = (cursors: readonly Cursor[]) =>
  group(
    cursors.flatMap(({ clientId, context }) =>
      selectedIds(context).map((anchorId) => ({ anchorId, clientId })),
    ),
  );

function sameGroups(a: Groups, b: Groups): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key]?.join() === b[key]?.join());
}

function useCardPeers() {
  const { useLocalContext, useRemoteCursorsSelector, useRemoteUsers } = cardHooks;
  const here = useRemoteCursorsSelector(whoIsOn, sameGroups);
  const picked = useRemoteCursorsSelector(whoPicked, sameGroups);
  const users = useRemoteUsers();
  const [context, setContext] = useLocalContext();
  const mine = selectedIds(context);
  const byClient = (clientIds: string[] = []) => users.filter(({ clientId }) => clientIds.includes(clientId));

  return {
    peersOn: (anchorId: string) => byClient(here[anchorId]),
    peerPicking: (anchorId: string) => byClient(picked[anchorId])[0],
    isSelected: (anchorId: string) => mine.includes(anchorId),
    toggle: (anchorId: string) =>
      setContext({ ...context, selection: mine.includes(anchorId) ? [] : [anchorId] }),
  };
}

type CardPeers = ReturnType<typeof useCardPeers>;

function CardTile({ id, title, peers }: { id: string; title: string; peers: CardPeers }) {
  const anchorId = `board.card:${id}`;
  const picker = peers.peerPicking(anchorId);
  const pickerColor = safeColor(picker?.user?.color, "#4f46e5");
  const selected = peers.isSelected(anchorId);

  return (
    <div
      data-anchor={anchorId}
      className={`flex flex-col gap-1 rounded-md border bg-fd-background px-2 py-1.5 shadow-xs ${selected ? "border-fd-primary" : "border-fd-border"}`}
      style={
        picker !== undefined
          ? { backgroundColor: `color-mix(in srgb, ${pickerColor} 22%, var(--color-fd-background))` }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => peers.toggle(anchorId)}
          className="min-w-0 flex-1 truncate text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
        >
          {title}
        </button>
        <span className="flex -space-x-1">
          {peers.peersOn(anchorId).map(({ clientId, user }) => (
            <span
              key={clientId}
              title={user?.name ?? "Guest"}
              className="grid size-4 place-items-center rounded-full text-[8px] font-semibold text-white ring-2 ring-fd-background"
              style={{ backgroundColor: safeColor(user?.color, "#6b7280") }}
            >
              {(user?.name ?? "?").charAt(0)}
            </span>
          ))}
        </span>
      </div>
      {picker !== undefined && (
        <span
          className="w-fit rounded px-1 text-[9px] font-semibold text-white"
          style={{ backgroundColor: pickerColor }}
        >
          Selected by {picker.user?.name ?? "Guest"}
        </span>
      )}
    </div>
  );
}

let tileRenders = 0;

function TestBoard() {
  const peers = useCardPeers();
  tileRenders += 1;
  return (
    <>
      <CardTile id="a" title="Card A" peers={peers} />
      <CardTile id="b" title="Card B" peers={peers} />
    </>
  );
}

// join-leave-announcer.mdx

type Person = { name: string };
const announceHooks = createPresenceHooks<unknown, Person>();

const BURST_MS = 1000;
const CLEAR_MS = 100;

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

function describeChanges(changes: PeerChange<unknown, Person>[]): string {
  const [only] = changes;
  if (changes.length === 1 && only !== undefined)
    return `${only.user?.name ?? "Someone"} ${only.type === "join" ? "joined" : "left"}`;
  const joined = changes.filter(({ type }) => type === "join").length;
  const left = changes.length - joined;
  return [joined > 0 && `${people(joined)} joined`, left > 0 && `${people(left)} left`]
    .filter(Boolean)
    .join(", ");
}

function PeerAnnouncer() {
  const { usePeerChanges } = announceHooks;
  const [message, setMessage] = useState("");
  const pending = useRef<PeerChange<unknown, Person>[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  usePeerChanges((change) => {
    if (change.type === "update") return;
    pending.current.push(change);
    timer.current ??= setTimeout(() => {
      const text = describeChanges(pending.current);
      pending.current = [];
      timer.current = undefined;
      // A region does not announce a message equal to the last one, so clear it first.
      setMessage("");
      announceTimer.current = setTimeout(() => setMessage(text), CLEAR_MS);
    }, BURST_MS);
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(announceTimer.current);
    },
    [],
  );

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}

// typing-and-away.mdx

type Status = { typingIn: string | null; away: boolean };
const statusHooks = createPresenceHooks<Status, Person>();

const TYPING_STOP_MS = 2000;

function useStatus(): (patch: Partial<Status>) => void {
  const { useLocalContext } = statusHooks;
  const [context, setContext] = useLocalContext();
  const latest = useRef(context);

  useEffect(() => {
    latest.current = context;
  }, [context]);

  const publish = useCallback(
    (patch: Partial<Status>) => {
      const current = { typingIn: null, away: false, ...latest.current };
      const next = { ...current, ...patch };
      if (next.typingIn === current.typingIn && next.away === current.away) return;
      latest.current = next;
      setContext(next);
    },
    [setContext],
  );

  useEffect(() => {
    const sync = () => publish({ away: document.visibilityState === "hidden" });
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [publish]);

  return publish;
}

function CommentBox({ anchorId, publish }: { anchorId: string; publish: (patch: Partial<Status>) => void }) {
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stopTyping = () => {
    clearTimeout(stopTimer.current);
    publish({ typingIn: null });
  };

  useEffect(() => () => clearTimeout(stopTimer.current), []);

  return (
    <textarea
      data-anchor={anchorId}
      aria-label="Comment"
      onChange={() => {
        publish({ typingIn: anchorId });
        clearTimeout(stopTimer.current);
        stopTimer.current = setTimeout(stopTyping, TYPING_STOP_MS);
      }}
      onBlur={stopTyping}
    />
  );
}

function Comments() {
  const publish = useStatus();
  return <CommentBox anchorId="comments.box" publish={publish} />;
}

function TypingHint({ anchorId }: { anchorId: string }) {
  const { useRemotePresence } = statusHooks;
  const names = useRemotePresence()
    .filter(({ context }) => context?.typingIn === anchorId && !context.away)
    .map(({ user }) => user?.name ?? "Someone");

  return names.length === 0 ? null : <p>{names.join(", ")} typing…</p>;
}

function cursor(clientId: string, overrides: Partial<Cursor> = {}): Cursor {
  return {
    clientId,
    x: 1,
    y: 2,
    visible: true,
    pointVisible: true,
    anchorId: null,
    tier: "anchor",
    idle: false,
    ...overrides,
  };
}

describe("doc recipes for ui context", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("shows peers on their card, rings a picked card, and skips rerenders for equal groups", () => {
    const { client, pushRemote } = makeFakeClient<Context, User>();
    const fake = makeFakeBinding<Context, User>();
    const setContext = vi.spyOn(client, "setContext");
    act(() =>
      root.render(
        <cardHooks.PresenceProvider client={client} binding={fake.binding}>
          <TestBoard />
        </cardHooks.PresenceProvider>,
      ),
    );
    act(() =>
      pushRemote([
        {
          version: 1,
          clientId: "p1",
          session: "s",
          sequence: 1,
          cursor: null,
          user: { name: "Mira", color: "#112233" },
        },
      ]),
    );
    const mira = { ...cursor("p1", { anchorId: "board.card:a" }), user: { name: "Mira", color: "#112233" } };
    act(() => fake.publish([{ ...mira, context: { selection: ["board.card:b", 7 as unknown as string] } }]));

    const [a, b] = [...container.querySelectorAll<HTMLElement>("[data-anchor]")];
    expect(a?.textContent).toBe("Card AM");
    expect(b?.getAttribute("style")).toContain("color-mix");
    expect(b?.textContent).toContain("Selected by Mira");
    expect(a?.getAttribute("style")).toBeNull();

    const before = tileRenders;
    act(() => fake.publish([{ ...mira, x: 50, context: { selection: ["board.card:b"] } }]));
    expect(tileRenders).toBe(before);

    act(() => a?.querySelector("button")?.click());
    expect(setContext).toHaveBeenCalledWith({ selection: ["board.card:a"] });
  });

  it("collapses a burst of joins and leaves into one polite message", () => {
    vi.useFakeTimers();
    const { client } = makeFakeClient<unknown, Person>();
    const listeners = new Set<(change: PeerChange<unknown, Person>) => void>();
    client.subscribePeers = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const emit = (change: PeerChange<unknown, Person>) => {
      act(() => {
        for (const listener of listeners) listener(change);
      });
    };
    act(() =>
      root.render(
        <announceHooks.PresenceProvider client={client} binding={makeFakeBinding<unknown, Person>().binding}>
          <PeerAnnouncer />
        </announceHooks.PresenceProvider>,
      ),
    );
    const region = container.querySelector('[role="status"]');
    expect(region?.getAttribute("aria-live")).toBe("polite");

    emit({ type: "join", clientId: "a", user: { name: "Ada" } });
    emit({ type: "update", clientId: "a", user: { name: "Ada B" } });
    const flush = () =>
      act(() => {
        vi.advanceTimersByTime(BURST_MS);
      });
    const settle = () =>
      act(() => {
        vi.advanceTimersByTime(CLEAR_MS);
      });
    flush();
    expect(region?.textContent).toBe("");
    settle();
    expect(region?.textContent).toBe("Ada joined");

    emit({ type: "join", clientId: "a", user: { name: "Ada" } });
    flush();
    expect(region?.textContent).toBe("");
    settle();
    expect(region?.textContent).toBe("Ada joined");

    emit({ type: "join", clientId: "b" });
    emit({ type: "join", clientId: "c" });
    emit({ type: "leave", clientId: "a", user: { name: "Ada" } });
    expect(region?.textContent).toBe("Ada joined");
    flush();
    settle();
    expect(region?.textContent).toBe("2 people joined, 1 person left");
  });

  it("sends typing and away together, once per change, and shows the typing hint", () => {
    const sender = makeFakeClient<Status, Person>();
    const setContext = vi.spyOn(sender.client, "setContext");
    const sent = () => setContext.mock.calls.map(([next]) => next);
    act(() =>
      root.render(
        <statusHooks.PresenceProvider
          client={sender.client}
          binding={makeFakeBinding<Status, Person>().binding}
        >
          <Comments />
        </statusHooks.PresenceProvider>,
      ),
    );
    const box = container.querySelector("textarea");
    let typed = 0;
    const type = () => {
      // oxlint-disable-next-line typescript/unbound-method -- React ignores a value set without the native setter
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      act(() => {
        setValue?.call(box, `text ${++typed}`);
        box?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    type();
    type();
    expect(sent()).toEqual([{ typingIn: "comments.box", away: false }]);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(sent().at(-1)).toEqual({ typingIn: "comments.box", away: true });
    act(() => {
      box?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent().at(-1)).toEqual({ typingIn: null, away: true });
    vi.restoreAllMocks();

    const receiver = makeFakeClient<Status, Person>();
    act(() =>
      root.render(
        <statusHooks.PresenceProvider
          client={receiver.client}
          binding={makeFakeBinding<Status, Person>().binding}
        >
          <TypingHint anchorId="comments.box" />
        </statusHooks.PresenceProvider>,
      ),
    );
    const peer = (clientId: string, context: Status) => ({
      version: 1 as const,
      clientId,
      session: "s",
      sequence: 1,
      cursor: null,
      user: { name: clientId },
      context,
    });
    act(() =>
      receiver.pushRemote([
        peer("Ada", { typingIn: "comments.box", away: false }),
        peer("Bo", { typingIn: "comments.box", away: true }),
        peer("Cy", { typingIn: "other", away: false }),
      ]),
    );
    expect(container.textContent).toBe("Ada typing…");
  });

  it("keeps the page samples in step with these copies and the kanban scene", () => {
    const pages = [
      ["get-started/guides/card-occupancy.mdx", "function useCardPeers"],
      ["get-started/guides/join-leave-announcer.mdx", "function PeerAnnouncer"],
      ["get-started/guides/typing-and-away.mdx", "function useStatus"],
    ] as const;
    const withoutImports = (sample: string) => sample.replaceAll(/^\} from "[^"]+";\n/gmu, "");
    const samples = pages.map(([page, marker]) => withoutImports(docSample(page, marker)));
    for (const sample of samples) expect(missingLines("docs-ui-recipes.test.tsx", sample)).toEqual([]);

    const scene = new Set(
      trimLines(readRepoFile("apps/docs/components/examples/kanban.tsx"))
        .split("\n")
        .map((line) => line.replace(/;$/u, "")),
    );
    const kanbanLines = trimLines(samples[0] ?? "")
      .split("\n")
      .map((line) => line.replace(/;$/u, ""))
      .filter((line) => line !== "");
    expect(kanbanLines.filter((line) => !scene.has(line))).toEqual([]);
  });
});

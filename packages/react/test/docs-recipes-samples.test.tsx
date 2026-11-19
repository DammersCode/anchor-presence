// Type-checked copies of the recipes in apps/docs/content/docs/get-started/guides (cursor-chat, follow-mode, offscreen-hints).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPresenceHooks,
  CursorLayer as PlainLayer,
  DefaultCursor,
  PresenceProvider as PlainProvider,
  useRemoteCursors,
} from "../src/index";
import type { EventMap, PeerChange, PresenceClient, ResolvedCursor, TypedRemoteEvent } from "../src/index";
import { missingLines } from "./doc-source";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

// cursor-chat.mdx and follow-mode.mdx: presence.ts

type User = { name: string };

const {
  CursorLayer,
  PresenceProvider,
  usePresenceClient,
  useRemoteEvents,
  usePeerChanges,
  useRemoteCursorsSelector,
  useDomBinding,
  useRemoteUsers,
} = createPresenceHooks<unknown, User>();

// cursor-chat.mdx

const CHAT_MAX_LENGTH = 100;
const CHAT_HIDE_MS = 5000;
const NAME_MAX_LENGTH = 40;

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;

function cutGraphemes(text: string, max: number): string {
  const units = segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
  return units.length <= max ? text : units.slice(0, max).join("");
}

function readChatText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const text: unknown = (data as { text?: unknown }).text;
  if (typeof text !== "string") return null;
  const trimmed = cutGraphemes(text.trim(), CHAT_MAX_LENGTH);
  return trimmed === "" ? null : trimmed;
}

function useRemoteChat(): Record<string, string> {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useRemoteEvents((event) => {
    if (event.type !== "chat") return;
    const text = readChatText(event.data);
    if (text === null) return;
    const { clientId } = event;
    setMessages((current) => ({ ...current, [clientId]: text }));
    clearTimeout(timers.current.get(clientId));
    timers.current.set(
      clientId,
      setTimeout(() => {
        timers.current.delete(clientId);
        setMessages((current) => {
          const next = { ...current };
          delete next[clientId];
          return next;
        });
      }, CHAT_HIDE_MS),
    );
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  return messages;
}

function ChatCursorLayer() {
  const messages = useRemoteChat();
  return (
    <CursorLayer
      getLabel={(cursor) =>
        messages[cursor.clientId] ??
        (typeof cursor.user?.name === "string" ? cutGraphemes(cursor.user.name, NAME_MAX_LENGTH) : undefined)
      }
      renderCursor={({ label, color }) => (
        <DefaultCursor label={label} color={color} labelStyle={{ maxWidth: "24rem", whiteSpace: "normal" }} />
      )}
    />
  );
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

function ChatComposer() {
  const client = usePresenceClient();
  const pointer = useRef({ x: 0, y: 0 });
  const bubble = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (bubble.current !== null) {
        bubble.current.style.transform = `translate(${event.clientX + 16}px, ${event.clientY + 16}px)`;
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || isTextField(event.target)) return;
      event.preventDefault();
      setOrigin(pointer.current);
      setOpen(true);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (sent === null) return;
    const timer = setTimeout(() => setSent(null), CHAT_HIDE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "Enter") return;
    const text = readChatText({ text: event.currentTarget.value });
    setOpen(false);
    if (text !== null && client?.sendEvent("chat", { text }) === true) setSent(text);
  }

  if (!open && sent === null) return null;
  return (
    <div
      ref={bubble}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 10000,
        transform: `translate(${origin.x + 16}px, ${origin.y + 16}px)`,
      }}
    >
      {open ? (
        <input aria-label="Chat message" maxLength={CHAT_MAX_LENGTH} autoFocus onKeyDown={onInputKeyDown} />
      ) : (
        <div role="status">{sent}</div>
      )}
    </div>
  );
}

function ChatApp({ client }: { client: PresenceClient<unknown, User> }) {
  return (
    <PresenceProvider client={client}>
      <main>{/* your app */}</main>
      <ChatCursorLayer />
      <ChatComposer />
    </PresenceProvider>
  );
}

// follow-mode.mdx

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function isOffscreen(cursor: ResolvedCursor, width: number, height: number): boolean {
  return !cursor.pointVisible || cursor.x < 0 || cursor.y < 0 || cursor.x > width || cursor.y > height;
}

function useFollowMode(): {
  leaderId: string | null;
  follow: (clientId: string) => void;
  stop: () => void;
} {
  const binding = useDomBinding();
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const stop = useCallback(() => setLeaderId(null), []);
  usePeerChanges((change) => {
    if (change.type === "leave" && change.clientId === leaderId) stop();
  });

  const selectTarget = useCallback(
    (cursors: readonly ResolvedCursor[]) => {
      const leader = cursors.find((cursor) => cursor.clientId === leaderId);
      if (leader === undefined || leader.anchorId === null) return null;
      return isOffscreen(leader, window.innerWidth, window.innerHeight) ? leader.anchorId : null;
    },
    [leaderId],
  );
  const target = useRemoteCursorsSelector(selectTarget);

  useEffect(() => {
    if (target !== null)
      binding?.getAnchorElement(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [binding, target]);

  useEffect(() => {
    if (leaderId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || SCROLL_KEYS.has(event.key)) stop();
    }
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [leaderId, stop]);

  return { leaderId, follow: setLeaderId, stop };
}

function FollowControls() {
  const users = useRemoteUsers();
  const { leaderId, follow, stop } = useFollowMode();

  if (leaderId !== null) {
    return (
      <button type="button" onClick={stop}>
        Stop following
      </button>
    );
  }
  return (
    <ul>
      {users.map((peer) => (
        <li key={peer.clientId}>
          <button type="button" onClick={() => follow(peer.clientId)}>
            Follow {peer.user?.name ?? "Guest"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FollowApp({ client }: { client: PresenceClient<unknown, User> }) {
  return (
    <PresenceProvider client={client}>
      <FollowControls />
      <main>{/* your app, with data-anchor elements */}</main>
      <CursorLayer />
    </PresenceProvider>
  );
}

// offscreen-hints.mdx

type EdgeHint = { clientId: string; x: number; y: number; angle: number };

function edgeHint(cursor: ResolvedCursor, width: number, height: number, inset = 16): EdgeHint | null {
  if (!cursor.visible || cursor.tier === "hidden") return null;
  const inside = cursor.x >= 0 && cursor.x <= width && cursor.y >= 0 && cursor.y <= height;
  if (inside) return null;
  const x = Math.min(Math.max(cursor.x, inset), width - inset);
  const y = Math.min(Math.max(cursor.y, inset), height - inset);
  return { clientId: cursor.clientId, x, y, angle: Math.atan2(cursor.y - y, cursor.x - x) };
}

function OffscreenHints() {
  const cursors = useRemoteCursors();
  const hints = cursors.flatMap((cursor) => {
    const hint = edgeHint(cursor, window.innerWidth, window.innerHeight);
    return hint === null ? [] : [hint];
  });

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {hints.map((hint) => (
        <svg
          key={hint.clientId}
          data-edge-hint={hint.clientId}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${hint.x - 8}px, ${hint.y - 8}px) rotate(${hint.angle}rad)`,
          }}
        >
          <path d="M2 2 L14 8 L2 14 Z" fill="#2563eb" />
        </svg>
      ))}
    </div>
  );
}

// offscreen-hints.mdx uses the untyped provider, so this copy binds the two names to it
function HintsApp({ client }: { client: PresenceClient }) {
  // oxlint-disable-next-line eslint/no-shadow -- the copy keeps the names of the sample
  const PresenceProvider = PlainProvider;
  // oxlint-disable-next-line eslint/no-shadow -- the copy keeps the names of the sample
  const CursorLayer = PlainLayer;
  return (
    <PresenceProvider client={client}>
      <main>{/* your app */}</main>
      <CursorLayer />
      <OffscreenHints />
    </PresenceProvider>
  );
}

// tests

function cursorAt(
  clientId: string,
  overrides: Partial<ResolvedCursor<unknown, User>> = {},
): ResolvedCursor<unknown, User> {
  return {
    clientId,
    x: 100,
    y: 100,
    visible: true,
    pointVisible: true,
    anchorId: "orders",
    tier: "anchor",
    idle: false,
    ...overrides,
  };
}

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

describe("recipe usage samples", () => {
  it("render on the server with a client", () => {
    const { client } = makeFakeClient<unknown, User>();
    expect(renderToString(<ChatApp client={client} />)).toContain("<main>");
    expect(renderToString(<FollowApp client={client} />)).toContain("<ul>");
    expect(renderToString(<HintsApp client={makeFakeClient().client} />)).toContain("aria-hidden");
  });
});

describe("cursor chat recipe", () => {
  it("caps the text, trims it and rejects anything that is not a string", () => {
    expect(readChatText({ text: "x".repeat(500) })).toHaveLength(CHAT_MAX_LENGTH);
    expect(readChatText({ text: "  hi  " })).toBe("hi");
    expect(readChatText({ text: "👨‍👩‍👧".repeat(150) })).toBe("👨‍👩‍👧".repeat(CHAT_MAX_LENGTH));
    expect(readChatText({ text: 42 })).toBeNull();
    expect(readChatText("hi")).toBeNull();
    expect(readChatText({ text: "   " })).toBeNull();
  });

  it("sends the typed text as a chat event and hides the local bubble after the timeout", () => {
    vi.useFakeTimers();
    const { client } = makeFakeClient<unknown, User>();
    const sent: Array<[string, unknown]> = [];
    client.sendEvent = (type, data) => {
      sent.push([type, data]);
      return true;
    };
    act(() =>
      root.render(
        <PresenceProvider client={client} binding={makeFakeBinding<unknown, User>().binding}>
          <ChatComposer />
        </PresenceProvider>,
      ),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    act(() => {
      input!.value = "hello there";
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(sent).toEqual([["chat", { text: "hello there" }]]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("hello there");
    act(() => {
      vi.advanceTimersByTime(CHAT_HIDE_MS);
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("shows a remote chat as plain text next to the remote cursor, then falls back to the name", () => {
    vi.useFakeTimers();
    const { client } = makeFakeClient<unknown, User>();
    const listeners = new Set<(event: TypedRemoteEvent<EventMap>) => void>();
    client.subscribeEvents = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const fake = makeFakeBinding<unknown, User>();
    act(() =>
      root.render(
        <PresenceProvider client={client} binding={fake.binding}>
          <ChatCursorLayer />
        </PresenceProvider>,
      ),
    );
    act(() => fake.publish([{ ...cursorAt("peer"), user: { name: "Ada" } }]));
    expect(document.body.textContent).toContain("Ada");

    act(() => {
      for (const listener of listeners) {
        listener({ clientId: "peer", type: "chat", data: { text: "<b>bold</b>" } });
      }
    });
    expect(document.body.textContent).toContain("<b>bold</b>");
    expect(document.body.querySelector("b")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(CHAT_HIDE_MS);
    });
    expect(document.body.textContent).not.toContain("<b>bold</b>");
    expect(document.body.textContent).toContain("Ada");
  });
});

describe("follow mode recipe", () => {
  it("scrolls the leader's anchor into view and stops on wheel, Escape or leave", () => {
    const { client, pushRemote } = makeFakeClient<unknown, User>();
    const peerListeners = new Set<(change: PeerChange<unknown, User>) => void>();
    client.subscribePeers = (listener) => {
      peerListeners.add(listener);
      return () => peerListeners.delete(listener);
    };
    const fake = makeFakeBinding<unknown, User>();
    const anchor = document.createElement("section");
    anchor.dataset.anchor = "orders";
    const scrollIntoView = vi.fn();
    anchor.scrollIntoView = scrollIntoView;
    document.body.append(anchor);

    act(() =>
      root.render(
        <PresenceProvider client={client} binding={fake.binding}>
          <FollowControls />
        </PresenceProvider>,
      ),
    );
    act(() =>
      pushRemote([
        { version: 1, clientId: "leader", session: "s", sequence: 1, cursor: null, user: { name: "Ada" } },
      ]),
    );
    const followButton = (): HTMLButtonElement => container.querySelector("button")!;
    const follow = () => act(() => followButton().click());

    follow();
    expect(followButton().textContent).toBe("Stop following");
    act(() => fake.publish([cursorAt("leader", { y: 3000 })]));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    act(() => fake.publish([cursorAt("leader", { y: 2990 })]));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new WheelEvent("wheel"));
    });
    expect(followButton().textContent).toBe("Follow Ada");

    follow();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(followButton().textContent).toBe("Follow Ada");

    follow();
    act(() => {
      for (const listener of peerListeners) listener({ type: "leave", clientId: "leader" });
    });
    expect(followButton().textContent).toBe("Follow Ada");
    expect(peerListeners.size).toBe(1);
    anchor.remove();
  });

  it("treats a point outside the window or under a clip as off-screen", () => {
    expect(isOffscreen(cursorAt("a"), 800, 600)).toBe(false);
    expect(isOffscreen(cursorAt("a", { y: 900 }), 800, 600)).toBe(true);
    expect(isOffscreen(cursorAt("a", { pointVisible: false }), 800, 600)).toBe(true);
  });
});

describe("off-screen hint recipe", () => {
  it("clamps an outside point to the window edge and points the arrow at it", () => {
    expect(edgeHint(cursorAt("a", { x: -200, y: 300 }), 800, 600)).toEqual({
      clientId: "a",
      x: 16,
      y: 300,
      angle: Math.PI,
    });
    const corner = edgeHint(cursorAt("a", { x: 1000, y: 1000 }), 800, 600);
    expect(corner).toMatchObject({ x: 784, y: 584 });
    expect(corner?.angle).toBeCloseTo(Math.atan2(416, 216));
    expect(edgeHint(cursorAt("a", { x: 400, y: 300 }), 800, 600)).toBeNull();
    expect(edgeHint(cursorAt("a", { x: -50, tier: "hidden" }), 800, 600)).toBeNull();
  });

  it("renders one hint per remote cursor outside the window", () => {
    const fake = makeFakeBinding();
    act(() =>
      root.render(
        <PlainProvider client={makeFakeClient().client} binding={fake.binding}>
          <OffscreenHints />
        </PlainProvider>,
      ),
    );
    act(() =>
      fake.publish([cursorAt("inside"), cursorAt("above", { y: -400 }), cursorAt("right", { x: 5000 })]),
    );
    const hints = [...container.querySelectorAll<SVGElement>("[data-edge-hint]")].map(
      (node) => node.dataset.edgeHint,
    );
    expect(hints).toEqual(["above", "right"]);
    expect(container.querySelector('[data-edge-hint="above"]')?.getAttribute("style")).toContain(
      "translate(92px, 8px)",
    );
  });
});

describe("recipe sources", () => {
  const pages = ["cursor-chat", "follow-mode", "offscreen-hints"];
  const blocks = pages.flatMap((page) => {
    const path = join(process.cwd(), `apps/docs/content/docs/get-started/guides/${page}.mdx`);
    return [...readFileSync(path, "utf8").matchAll(/```tsx\r?\n([\s\S]*?)```/gu)].map(
      ([, body = ""]) => body,
    );
  });

  it("match the copies in this file", () => {
    const missing = blocks.flatMap((block) =>
      missingLines(
        "docs-recipes-samples.test.tsx",
        block.replaceAll("export ", "").replaceAll(/^import [^;]*;\n/gmu, ""),
      ),
    );
    expect(missing).toEqual([]);
  });
});

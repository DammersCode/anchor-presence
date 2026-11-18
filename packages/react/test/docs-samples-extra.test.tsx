import { act, useEffect } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import type { ResolvedCursor } from "@anchor-presence/dom";
import {
  CursorLayer,
  DefaultCursor,
  LiveCursorProvider,
  useCursorContext,
  useCursorPresence,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteUsers,
} from "../src/index";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function DialogBody() {
  return <div role="dialog" />;
}

function MyCursorGlyph({ color, children }: { color: string; children: ReactNode }) {
  return <span data-color={color}>{children}</span>;
}

// cursor-context.mdx: Usage
function SettingsDialog({ open }: { open: boolean }) {
  const [, setContext] = useCursorContext();
  useEffect(() => {
    setContext({ dialog: open ? "settings" : undefined });
  }, [open, setContext]);
  return open ? <DialogBody /> : null;
}

function ContextReader() {
  const [context] = useCursorContext<{ dialog?: string }>();
  return <output>{String(context?.dialog)}</output>;
}

// cursor-presence.mdx: Usage
function PointerTypeBadge() {
  const presence = useCursorPresence();
  const touchCount = presence.filter((p) => p.pointer?.type === "touch").length;
  return <span>{touchCount} touch users</span>;
}

// remote-users.mdx: Usage
type MyUser = { name: string; color: string };

function PresenceList() {
  const users = useRemoteUsers<MyUser>();
  return (
    <ul>
      {users.map((entry) => (
        <li key={entry.clientId} style={{ opacity: entry.idle ? 0.5 : 1 }}>
          {entry.user?.name ?? "Guest"}
        </li>
      ))}
    </ul>
  );
}

// remote-cursors.mdx: useRemoteCursors
function CursorCount() {
  const cursors = useRemoteCursors();
  const visibleCount = cursors.filter((cursor) => cursor.visible).length;
  return <span>{visibleCount} cursors visible</span>;
}

// remote-cursors.mdx: useRemoteCursorsSelector
function selectClippedClientIds(cursors: ResolvedCursor[]): ReadonlySet<string> {
  const clipped = new Set<string>();
  for (const cursor of cursors) {
    if (cursor.tier === "anchor" && !cursor.pointVisible) clipped.add(cursor.clientId);
  }
  return clipped;
}

function sameClientIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

let pillRenders = 0;
function PresencePill() {
  const clipped = useRemoteCursorsSelector(selectClippedClientIds, sameClientIds);
  pillRenders += 1;
  return <span>{clipped.size} out of view</span>;
}

// custom-cursors.mdx: renderCursor
function GlyphLayer() {
  return (
    <CursorLayer
      renderCursor={({ label, color }) => (
        <MyCursorGlyph color={color}>
          <span>{label}</span>
        </MyCursorGlyph>
      )}
    />
  );
}

// custom-cursors.mdx: DefaultCursor
function LargeCursorLayer() {
  return (
    <CursorLayer
      renderCursor={({ label, color }) => (
        <DefaultCursor label={label} color={color} style={{ "--anchor-presence-cursor-size": "28px" }} />
      )}
    />
  );
}

// cursor-layer.mdx: Label and color
type LayerUser = { name: string; color?: string };

function LabeledLayer() {
  return (
    <CursorLayer<unknown, LayerUser>
      getLabel={(cursor) => cursor.user?.name ?? "Guest"}
      getColor={(cursor) => cursor.user?.color ?? "#6b7280"}
    />
  );
}

function makeCursor<TUser = unknown>(clientId: string, extra: Partial<ResolvedCursor<unknown, TUser>> = {}) {
  const base: ResolvedCursor<unknown, TUser> = {
    clientId,
    x: 10,
    y: 20,
    visible: true,
    pointVisible: true,
    anchorId: "card",
    tier: "anchor",
    idle: false,
  };
  return { ...base, ...extra };
}

describe("extra docs samples", () => {
  const roots: Root[] = [];
  const containers: HTMLDivElement[] = [];

  function mount(node: ReactNode): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(node));
    roots.push(root);
    containers.push(container);
    return container;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    for (const container of containers.splice(0)) container.remove();
  });

  it("cursor-context.mdx: SettingsDialog sets the context, and a direct setContext reaches the hook", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient<{ dialog?: string }>({ transport: a });
    const view = mount(
      <LiveCursorProvider client={client}>
        <SettingsDialog open />
        <ContextReader />
      </LiveCursorProvider>,
    );
    expect(client.getContext()).toEqual({ dialog: "settings" });
    expect(view.querySelector("[role=dialog]")).not.toBeNull();

    act(() => client.setContext({ dialog: "direct" }));
    expect(view.querySelector("output")?.textContent).toBe("direct");
    client.dispose();
  });

  it("cursor-presence.mdx: PointerTypeBadge counts touch pointers", () => {
    const { client, pushRemote } = makeFakeClient();
    const view = mount(
      <LiveCursorProvider client={client}>
        <PointerTypeBadge />
      </LiveCursorProvider>,
    );
    act(() =>
      pushRemote([
        { version: 1, clientId: "a", session: "sa", sequence: 0, cursor: null, pointer: { type: "touch" } },
        { version: 1, clientId: "b", session: "sb", sequence: 0, cursor: null, pointer: { type: "mouse" } },
      ]),
    );
    expect(view.textContent).toBe("1 touch users");
  });

  it("remote-users.mdx: PresenceList shows names and dims idle users", () => {
    const { client, pushRemote } = makeFakeClient<unknown, MyUser>();
    const view = mount(
      <LiveCursorProvider client={client}>
        <PresenceList />
      </LiveCursorProvider>,
    );
    act(() =>
      pushRemote(
        [
          {
            version: 1,
            clientId: "a",
            session: "sa",
            sequence: 0,
            cursor: null,
            user: { name: "Ada", color: "red" },
          },
          { version: 1, clientId: "b", session: "sb", sequence: 0, cursor: null },
        ],
        new Set(["b"]),
      ),
    );
    const items = [...view.querySelectorAll("li")];
    expect(items.map((item) => item.textContent)).toEqual(["Ada", "Guest"]);
    expect(items.map((item) => item.style.opacity)).toEqual(["1", "0.5"]);
  });

  it("remote-cursors.mdx: CursorCount counts only visible cursors", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <LiveCursorProvider client={client} binding={binding}>
        <CursorCount />
      </LiveCursorProvider>,
    );
    act(() => publish([makeCursor("a"), makeCursor("b", { visible: false, tier: "hidden" })]));
    expect(view.textContent).toBe("1 cursors visible");
  });

  it("remote-cursors.mdx: PresencePill rerenders only when the clipped set changes", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <LiveCursorProvider client={client} binding={binding}>
        <PresencePill />
      </LiveCursorProvider>,
    );
    act(() => publish([makeCursor("a", { pointVisible: false }), makeCursor("b")]));
    expect(view.textContent).toBe("1 out of view");
    const rendersAfterClip = pillRenders;

    act(() => publish([makeCursor("a", { pointVisible: false, x: 99 }), makeCursor("b", { x: 5 })]));
    expect(pillRenders).toBe(rendersAfterClip);
    expect(view.textContent).toBe("1 out of view");
  });

  it("custom-cursors.mdx: renderCursor receives the color and an empty label by default", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <LiveCursorProvider client={client} binding={binding}>
        <GlyphLayer />
      </LiveCursorProvider>,
    );
    act(() => publish([makeCursor("a")]));
    expect(
      view.querySelector<HTMLElement>("[data-anchor-presence-client-id=a] [data-color]")?.dataset.color,
    ).toBe("#6b7280");
  });

  it("custom-cursors.mdx: the CSS variable on DefaultCursor reaches its style", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <LiveCursorProvider client={client} binding={binding}>
        <LargeCursorLayer />
      </LiveCursorProvider>,
    );
    act(() => publish([makeCursor("a")]));
    const outer = view.querySelector<HTMLElement>("[data-anchor-presence-client-id=a] > span");
    expect(outer?.style.getPropertyValue("--anchor-presence-cursor-size")).toBe("28px");
  });

  it("cursor-layer.mdx: getLabel and getColor read the typed user", () => {
    const { client } = makeFakeClient<unknown, LayerUser>();
    const { binding, publish } = makeFakeBinding<unknown, LayerUser>();
    const view = mount(
      <LiveCursorProvider client={client} binding={binding}>
        <LabeledLayer />
      </LiveCursorProvider>,
    );
    act(() =>
      publish([
        makeCursor<LayerUser>("a", { user: { name: "Ada", color: "rgb(255, 0, 0)" } }),
        makeCursor<LayerUser>("b"),
      ]),
    );
    const labels = [...view.querySelectorAll("[data-anchor-presence-client-id] span > span")];
    expect(labels.map((label) => label.textContent)).toEqual(["Ada", "Guest"]);
    expect(labels[0]?.parentElement?.querySelector("path")?.getAttribute("fill")).toBe(
      "var(--anchor-presence-cursor-color, rgb(255, 0, 0))",
    );
  });
});

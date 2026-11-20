import { act, useEffect } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import { parserFrom } from "@anchor-presence/core/standard-schema";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding, ResolvedCursor, VisibilityPolicy } from "@anchor-presence/dom";
import * as v from "valibot";
import {
  CursorLayer,
  DefaultCursor,
  PresenceProvider,
  useLocalContext,
  useRemotePresence,
  useRemoteCursors,
  useRemoteCursorsSelector,
} from "../src/index";
import {
  CursorLayer as TypedCursorLayer,
  PresenceProvider as TypedProvider,
  useRemoteUsers,
} from "./doc-presence";
import type { Context, Events, User } from "./doc-presence";
import { docSample, missingLines, missingSamples } from "./doc-source";
import { makeFakeBinding, makeFakeClient } from "./test-utils";

function DialogBody() {
  return <div role="dialog" />;
}

function MyCursorGlyph({ color, children }: { color: string; children: ReactNode }) {
  return <span data-color={color}>{children}</span>;
}

// local-context.mdx: Usage
function SettingsDialog({ open }: { open: boolean }) {
  const [, setContext] = useLocalContext();
  useEffect(() => {
    setContext({ dialog: open ? "settings" : undefined });
  }, [open, setContext]);
  return open ? <DialogBody /> : null;
}

function ContextReader() {
  const [context] = useLocalContext();
  const dialog =
    typeof context === "object" && context !== null && "dialog" in context ? context.dialog : undefined;
  return <output>{String(dialog)}</output>;
}

// remote-presence.mdx: Usage
function ViewportOnlyBadge() {
  const presence = useRemotePresence();
  const count = presence.filter((p) => p.cursor !== null && p.cursor.anchors.length === 0).length;
  return <span>{count} viewport-only cursors</span>;
}

// remote-users.mdx: Usage
function PresenceList() {
  const users = useRemoteUsers();
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
function selectClippedClientIds(cursors: readonly ResolvedCursor[]): ReadonlySet<string> {
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

// custom-cursors.mdx: Style touch and pen cursors
function TouchRingLayer() {
  return (
    <CursorLayer
      renderCursor={({ label, color, pointerType }) =>
        pointerType === "touch" ? (
          <span
            style={{
              display: "block",
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: `2px solid ${color}`,
            }}
          />
        ) : (
          <DefaultCursor label={label} color={color} />
        )
      }
    />
  );
}

void TouchRingLayer;

// custom-cursors.mdx: Idle cursors
function ActiveCursorLayer() {
  return <CursorLayer filterCursor={(cursor) => !cursor.idle} />;
}

void ActiveCursorLayer;

// cursor-layer.mdx: Label and color
const safeColor = (color?: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : "#6b7280";

function LabeledLayer() {
  return (
    <TypedCursorLayer
      getLabel={(cursor) => cursor.user?.name ?? "Guest"}
      getColor={(cursor) => safeColor(cursor.user?.color)}
    />
  );
}

function makeCursor<TUser = unknown, TContext = unknown>(
  clientId: string,
  extra: Partial<ResolvedCursor<TContext, TUser>> = {},
) {
  const base: ResolvedCursor<TContext, TUser> = {
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

  it("local-context.mdx: SettingsDialog sets the context, and a direct setContext reaches the hook", () => {
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const view = mount(
      <PresenceProvider client={client}>
        <SettingsDialog open />
        <ContextReader />
      </PresenceProvider>,
    );
    expect(client.getContext()).toEqual({ dialog: "settings" });
    expect(view.querySelector("[role=dialog]")).not.toBeNull();

    act(() => client.setContext({ dialog: "direct" }));
    expect(view.querySelector("output")?.textContent).toBe("direct");
    client.dispose();
  });

  it("remote-presence.mdx: ViewportOnlyBadge counts cursors with no anchor", () => {
    const { client, pushRemote } = makeFakeClient();
    const view = mount(
      <PresenceProvider client={client}>
        <ViewportOnlyBadge />
      </PresenceProvider>,
    );
    act(() =>
      pushRemote([
        {
          version: 1,
          clientId: "a",
          session: "sa",
          sequence: 0,
          cursor: { anchors: [], viewport: { u: 0.5, v: 0.5 } },
        },
        {
          version: 1,
          clientId: "b",
          session: "sb",
          sequence: 0,
          cursor: { anchors: [{ id: "x", u: 0, v: 0 }] },
        },
      ]),
    );
    expect(view.textContent).toBe("1 viewport-only cursors");
  });

  it("remote-users.mdx: PresenceList shows names and dims idle users", () => {
    const { client, pushRemote } = makeFakeClient<Context, User, Events>();
    const view = mount(
      <TypedProvider client={client}>
        <PresenceList />
      </TypedProvider>,
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
      <PresenceProvider client={client} binding={binding}>
        <CursorCount />
      </PresenceProvider>,
    );
    act(() => publish([makeCursor("a"), makeCursor("b", { visible: false, tier: "hidden" })]));
    expect(view.textContent).toBe("1 cursors visible");
  });

  it("remote-cursors.mdx: PresencePill rerenders only when the clipped set changes", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <PresenceProvider client={client} binding={binding}>
        <PresencePill />
      </PresenceProvider>,
    );
    act(() => publish([makeCursor("a", { pointVisible: false }), makeCursor("b")]));
    expect(view.textContent).toBe("1 out of view");
    const rendersAfterClip = pillRenders;

    act(() => publish([makeCursor("a", { pointVisible: false, x: 99 }), makeCursor("b", { x: 5 })]));
    expect(pillRenders).toBe(rendersAfterClip);
    expect(view.textContent).toBe("1 out of view");
  });

  it("custom-cursors.mdx: renderCursor receives a color from the palette by default", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <PresenceProvider client={client} binding={binding}>
        <GlyphLayer />
      </PresenceProvider>,
    );
    act(() => publish([makeCursor("a")]));
    expect(
      view.querySelector<HTMLElement>("[data-anchor-presence-client-id=a] [data-color]")?.dataset.color,
    ).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it("shows the user name as the default label and keeps one color per client", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <PresenceProvider client={client} binding={binding}>
        <CursorLayer />
      </PresenceProvider>,
    );
    act(() => publish([{ ...makeCursor("a"), user: { name: "Ada" } }, makeCursor("b")]));
    expect(view.textContent).toContain("Ada");
    expect(view.querySelectorAll("[data-anchor-presence-client-id]")).toHaveLength(2);
  });

  it("custom-cursors.mdx: the CSS variable on DefaultCursor reaches its style", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const view = mount(
      <PresenceProvider client={client} binding={binding}>
        <LargeCursorLayer />
      </PresenceProvider>,
    );
    act(() => publish([makeCursor("a")]));
    const outer = view.querySelector<HTMLElement>("[data-anchor-presence-client-id=a] > span");
    expect(outer?.style.getPropertyValue("--anchor-presence-cursor-size")).toBe("28px");
  });

  it("cursor-layer.mdx: getLabel and getColor read the typed user", () => {
    const { client } = makeFakeClient<Context, User, Events>();
    const { binding, publish } = makeFakeBinding<Context, User>();
    const view = mount(
      <TypedProvider client={client} binding={binding}>
        <LabeledLayer />
      </TypedProvider>,
    );
    act(() =>
      publish([
        makeCursor<User, Context>("a", { user: { name: "Ada", color: "#ff0000" } }),
        makeCursor<User, Context>("b"),
      ]),
    );
    const labels = [...view.querySelectorAll("[data-anchor-presence-client-id] span > span")];
    expect(labels.map((label) => label.textContent)).toEqual(["Ada", "Guest"]);
    expect(labels[0]?.parentElement?.querySelector("path")?.getAttribute("fill")).toBe(
      "var(--anchor-presence-cursor-color, #ff0000)",
    );
  });
});

describe("default cursor appearance", () => {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  }

  it("keeps every default palette color readable under a white label", async () => {
    const source = (await import("node:fs")).readFileSync("packages/react/src/cursor.tsx", "utf8");
    const palette = source.match(/DEFAULT_PALETTE = \[([^\]]+)\]/u)?.[1]?.match(/#[0-9a-f]{6}/gu) ?? [];
    expect(palette.length).toBe(8);
    for (const color of palette) expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it("cuts a long user name in the default label", () => {
    const { client } = makeFakeClient();
    const { binding, publish } = makeFakeBinding();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <PresenceProvider client={client} binding={binding}>
          <CursorLayer />
        </PresenceProvider>,
      ),
    );
    act(() => publish([{ ...makeCursor("a"), user: { name: "x".repeat(500) } }]));
    expect(host.textContent?.length).toBeLessThanOrEqual(32);
    act(() => root.unmount());
    host.remove();
  });
});

const myTransport = createInMemoryPair().a;
const hideStaffCursors: VisibilityPolicy<{ role: string }> = ({ presence }) =>
  presence.context?.role === "staff" ? "hide" : "show";

describe("dom docs samples", () => {
  it("visibility-policy.mdx: a client with a context schema accepts the policy", () => {
    // visibility-policy.mdx: Write a custom policy
    const client = createPresenceClient({
      transport: myTransport,
      parseContext: parserFrom(v.object({ role: v.string() })),
    });
    const binding = createDomBinding(client, {
      resolution: { visibilityPolicy: hideStaffCursors },
    });
    expect(binding.getSnapshot()).toEqual([]);
    binding.dispose();
    client.dispose();
  });

  it("binding.mdx: scrollToAnchor scrolls the anchor element", () => {
    // binding.mdx: getAnchorElement
    function scrollToAnchor(binding: DomBinding, anchorId: string): void {
      binding.getAnchorElement(anchorId)?.scrollIntoView({ block: "center" });
    }
    const element = document.createElement("div");
    let options: unknown;
    element.scrollIntoView = (arg) => {
      options = arg;
    };
    scrollToAnchor({ getAnchorElement: () => element } as unknown as DomBinding, "card");
    expect(options).toEqual({ block: "center" });
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    expect(
      missingSamples("docs-samples-extra.test.tsx", [
        docSample("react/custom-cursors.mdx", "function TouchRingLayer"),
        docSample("react/custom-cursors.mdx", "function ActiveCursorLayer"),
        docSample("react/remote-cursors.mdx", "function CursorCount"),
        docSample("react/remote-presence.mdx", "function ViewportOnlyBadge"),
        docSample("dom/binding.mdx", "function scrollToAnchor"),
        docSample("react/remote-users.mdx", "function PresenceList"),
        docSample("react/local-context.mdx", "function SettingsDialog"),
      ]),
    ).toEqual([]);
    expect(
      missingLines(
        "docs-samples-extra.test.tsx",
        docSample("react/remote-cursors.mdx", "function selectClippedClientIds"),
      ),
    ).toEqual([]);
    expect(
      missingLines("docs-samples-extra.test.tsx", docSample("react/custom-cursors.mdx", "<MyCursorGlyph")),
    ).toEqual([]);
    expect(
      missingLines("docs-samples-extra.test.tsx", docSample("react/custom-cursors.mdx", 'size": "28px')),
    ).toEqual([]);
    expect(
      missingLines(
        "docs-samples-extra.test.tsx",
        docSample("dom/visibility-policy.mdx", "const binding = createDomBinding"),
      ),
    ).toEqual([]);
    const labelLayer = docSample("react/cursor-layer.mdx", "const safeColor").split("\n\n").at(-1) ?? "";
    expect(
      missingLines("docs-samples-extra.test.tsx", labelLayer.replace("<CursorLayer", "<TypedCursorLayer")),
    ).toEqual([]);
  });
});

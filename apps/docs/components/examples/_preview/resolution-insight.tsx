"use client";

import { usePresenceClient, useRemoteCursors, type ResolvedCursor } from "@anchor-presence/react";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { TourUser } from "./tour";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type Cursor = ResolvedCursor<unknown, TourUser>;

type Tracker = { tick: number; seen: Map<string, { key: string; tick: number }> };

// Focus the cursor whose resolution changed last, but never let a cursor without a position take the focus.
function pickFocus(cursors: Cursor[], tracker: Tracker): Cursor | null {
  let focus: Cursor | null = null;
  let focusTick = -1;
  const alive = new Set<string>();
  for (const cursor of cursors) {
    alive.add(cursor.clientId);
    const key = `${cursor.tier}|${cursor.anchorId ?? ""}|${cursor.pointVisible}|${cursor.idle}`;
    const seen = tracker.seen.get(cursor.clientId);
    let tick = seen?.tick ?? 0;
    if (seen?.key !== key) {
      if (cursor.tier !== "hidden") {
        tracker.tick += 1;
        tick = tracker.tick;
      }
      tracker.seen.set(cursor.clientId, { key, tick });
    }
    if (tick > focusTick) {
      focus = cursor;
      focusTick = tick;
    }
  }
  for (const clientId of tracker.seen.keys()) if (!alive.has(clientId)) tracker.seen.delete(clientId);
  return focus;
}

type Verdict = { text: string; tone: "exact" | "fallback" | "warn" | "muted"; detail?: string };

function describe(cursor: Cursor, sent: string[]): Verdict {
  if (cursor.tier === "hidden") return { text: "no position", tone: "muted" };
  if (cursor.tier === "viewport") return { text: "no anchor matched", tone: "warn" };
  if (!cursor.pointVisible) return { text: "out of view", tone: "warn" };
  const level = cursor.anchorId === null ? -1 : sent.indexOf(cursor.anchorId);
  if (level <= 0) return { text: "exact", tone: "exact" };
  return {
    text: `fallback +${level}`,
    tone: "fallback",
    detail: `${sent[0]} is missing here`,
  };
}

const TONE_CLASS: Record<Verdict["tone"], string> = {
  exact: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  fallback: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  warn: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  muted: "bg-fd-secondary text-fd-muted-foreground",
};

const TIER_CLASS: Record<Cursor["tier"], string> = {
  anchor: "border-indigo-500/40 text-indigo-700 dark:text-indigo-300",
  viewport: "border-rose-500/40 text-rose-700 dark:text-rose-300",
  hidden: "border-fd-border text-fd-muted-foreground",
};

function ResolvedOutline({ cursor, dashed }: { cursor: Cursor | null; dashed: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const anchorId =
    cursor !== null && cursor.tier === "anchor" && cursor.pointVisible ? cursor.anchorId : null;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const place = () => {
      const element =
        anchorId === null ? null : document.querySelector(`[data-anchor="${CSS.escape(anchorId)}"]`);
      if (element === null) {
        box.style.opacity = "0";
        return;
      }
      const rect = element.getBoundingClientRect();
      // A hidden outline jumps to its first element instead of sliding in from the last one.
      const wasHidden = box.style.opacity !== "1";
      if (wasHidden) box.style.transition = "none";
      box.style.opacity = "1";
      box.style.transform = `translate(${rect.left - 3}px, ${rect.top - 3}px)`;
      box.style.width = `${rect.width + 6}px`;
      box.style.height = `${rect.height + 6}px`;
      if (wasHidden) {
        void box.offsetWidth;
        box.style.transition = "";
      }
    };
    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  });

  const color = safeColor(cursor?.user?.color, "#4f46e5");
  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-40 rounded-lg opacity-0 transition-[transform,width,height,opacity] duration-150 ease-out"
      style={{
        border: `2px ${dashed ? "dashed" : "solid"} ${dashed ? "#d97706" : color}`,
        backgroundColor: `color-mix(in srgb, ${dashed ? "#d97706" : color} 7%, transparent)`,
      }}
    />
  );
}

/** Outlines the element the focused remote cursor resolved to, and shows tier and anchor in a status bar. */
export function ResolutionInsight() {
  const cursors = useRemoteCursors<unknown, TourUser>();
  const client = usePresenceClient<unknown, TourUser>();
  const trackerRef = useRef<Tracker>({ tick: 0, seen: new Map() });
  // The insight mirrors what the pane renders; a policy-hidden cursor must not outline its element.
  const shown = useMemo(() => cursors.filter((cursor) => cursor.visible), [cursors]);
  const focus = useMemo(() => pickFocus(shown, trackerRef.current), [shown]);

  const sent =
    focus === null
      ? []
      : (client
          ?.getRemoteSnapshot()
          .find((presence) => presence.clientId === focus.clientId)
          ?.cursor?.anchors.map((anchor) => anchor.id) ?? []);
  const verdict = focus === null ? null : describe(focus, sent);

  return (
    <>
      <ResolvedOutline cursor={focus} dashed={verdict?.tone === "fallback"} />
      <div
        role="status"
        aria-live="off"
        className="fixed inset-x-0 bottom-0 z-40 flex h-8 items-center gap-2 border-t border-fd-border bg-fd-background/95 px-2.5 text-[11px] backdrop-blur"
      >
        {focus === null || verdict === null ? (
          <span className="text-fd-muted-foreground">Waiting for a remote cursor</span>
        ) : (
          <>
            <span className="flex flex-none items-center gap-1.5 font-medium">
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: safeColor(focus.user?.color, "#6b7280"),
                  opacity: focus.idle ? 0.4 : 1,
                }}
              />
              {focus.user?.name ?? "Guest"}
            </span>
            <span className="text-fd-muted-foreground" aria-hidden="true">
              &rarr;
            </span>
            <span
              className={`flex-none rounded border px-1 font-mono text-[10px] leading-4 uppercase ${TIER_CLASS[focus.tier]}`}
            >
              {focus.tier}
            </span>
            {focus.anchorId !== null ? (
              <code className="min-w-0 truncate font-mono text-[11px] text-fd-foreground">
                {focus.anchorId}
              </code>
            ) : null}
            <span
              title={verdict.detail}
              className={`ml-auto flex-none rounded-full px-1.5 leading-5 font-medium ${TONE_CLASS[verdict.tone]}`}
            >
              {verdict.text}
              {focus.idle ? " · idle" : ""}
            </span>
          </>
        )}
      </div>
    </>
  );
}

"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { VisibilityPolicy } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider, useRemoteCursors } from "@anchor-presence/react";
import { useRef, type ReactNode, type RefObject } from "react";

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const THREADS = [
  { id: 1, from: "Priya", subject: "Launch checklist", time: "9:41" },
  { id: 2, from: "Marco", subject: "Pricing page copy", time: "9:12" },
  { id: 3, from: "Aiko", subject: "Q3 roadmap review", time: "8:55" },
  { id: 4, from: "Sam", subject: "Invoice #2043 overdue", time: "8:20" },
  { id: 5, from: "Lena", subject: "Design crit notes", time: "Tue" },
  { id: 6, from: "Omar", subject: "Onboarding survey results", time: "Tue" },
  { id: 7, from: "Grace", subject: "Status page incident", time: "Mon" },
  { id: 8, from: "Tomás", subject: "Contract renewal", time: "Mon" },
  { id: 9, from: "Nia", subject: "Team offsite plan", time: "Sun" },
];

// Hide a cursor whose anchor is still in the DOM but scrolled out of its container.
const clippedPointPolicy: VisibilityPolicy = ({ resolution }) =>
  !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";

const bindingOptions = { resolution: { visibilityPolicy: clippedPointPolicy } };

function OutOfViewHint({ listRef }: { listRef: RefObject<HTMLUListElement | null> }) {
  const clipped = useRemoteCursors<unknown, User>().find(
    (cursor) => cursor.tier === "anchor" && !cursor.pointVisible,
  );
  if (clipped === undefined || clipped.anchorId === null) return null;

  const anchorId = clipped.anchorId;
  const below = clipped.y > (listRef.current?.getBoundingClientRect().bottom ?? 0);
  const reveal = () =>
    listRef.current
      ?.querySelector(`[data-anchor="${CSS.escape(anchorId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });

  return (
    <button
      type="button"
      onClick={reveal}
      className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-[11px] font-medium text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring ${below ? "bottom-2" : "top-2"}`}
      style={{ backgroundColor: clipped.user?.color ?? "#4f46e5" }}
    >
      {below ? "↓" : "↑"} Show {clipped.user?.name ?? "the cursor"}
    </button>
  );
}

export function ScrollScene({ client, layout, children }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const wide = layout === "wide";

  return (
    <LiveCursorProvider client={client} bindingOptions={bindingOptions}>
      <div className="flex h-full flex-col p-2.5">
        <h3 className="font-display px-1 pb-1.5 text-sm font-semibold">Inbox</h3>
        <div className="relative min-h-0">
          <ul
            ref={listRef}
            data-anchor="inbox"
            className={`overflow-y-auto rounded-lg border border-fd-border bg-fd-background ${wide ? "" : "h-[148px]"}`}
          >
            {THREADS.map((thread) => (
              <li
                key={thread.id}
                data-anchor={`inbox.thread:${thread.id}`}
                className="flex h-[29px] items-center gap-2 border-b border-fd-border px-2.5 text-xs last:border-b-0"
              >
                <span className="grid size-5 flex-none place-items-center rounded-full bg-fd-secondary text-[10px] font-semibold">
                  {thread.from.charAt(0)}
                </span>
                <span className="w-12 flex-none truncate font-medium">{thread.from}</span>
                <span className="min-w-0 flex-1 truncate text-fd-muted-foreground">{thread.subject}</span>
                <span className="flex-none text-[10px] text-fd-muted-foreground">{thread.time}</span>
              </li>
            ))}
          </ul>
          <OutOfViewHint listRef={listRef} />
        </div>
        {wide ? null : (
          <p className="px-1 pt-2 text-[11px] text-fd-muted-foreground">
            Scroll the list to find the cursor.
          </p>
        )}
      </div>
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => cursor.user?.color ?? "#4f46e5"}
      />
      {children}
    </LiveCursorProvider>
  );
}

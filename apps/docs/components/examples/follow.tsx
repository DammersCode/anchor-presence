"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { VisibilityPolicy } from "@anchor-presence/dom";
import {
  CursorLayer,
  LiveCursorProvider,
  useCursorClient,
  useRemoteCursorsSelector,
} from "@anchor-presence/react";
import type { ResolvedCursor } from "@anchor-presence/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MIRA } from "./_preview/scenes";
import { LongPage } from "./long-page";

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

// Copy of the follow-mode.mdx recipe; only the scroll call differs.
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function isOffscreen(cursor: ResolvedCursor, width: number, height: number): boolean {
  return !cursor.pointVisible || cursor.x < 0 || cursor.y < 0 || cursor.x > width || cursor.y > height;
}

function findAnchor(anchorId: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>("[data-anchor]")) {
    if (element.dataset.anchor === anchorId) return element;
  }
  return null;
}

// In a preview iframe, scrollIntoView would also scroll the docs page around the frame.
function scrollToAnchor(anchorId: string): void {
  const element = findAnchor(anchorId);
  const scroller = element?.closest<HTMLElement>("[data-page-scroller]") ?? null;
  if (element === null || scroller === null) return;
  const box = element.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const top = scroller.scrollTop + box.top - view.top - (view.height - box.height) / 2;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
}

function useFollowMode(): {
  leaderId: string | null;
  follow: (clientId: string) => void;
  stop: () => void;
} {
  const client = useCursorClient();
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const stop = useCallback(() => setLeaderId(null), []);

  const selectTarget = useCallback(
    (cursors: ResolvedCursor[]) => {
      const leader = cursors.find((cursor) => cursor.clientId === leaderId);
      if (leader === undefined || leader.anchorId === null) return null;
      return isOffscreen(leader, window.innerWidth, window.innerHeight) ? leader.anchorId : null;
    },
    [leaderId],
  );
  const target = useRemoteCursorsSelector(selectTarget);

  useEffect(() => {
    if (target !== null) scrollToAnchor(target);
  }, [target]);

  useEffect(() => {
    if (leaderId === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || SCROLL_KEYS.has(event.key)) stop();
    }
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    const unsubscribe = client?.subscribePeers((change) => {
      if (change.type === "leave" && change.clientId === leaderId) stop();
    });
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe?.();
    };
  }, [client, leaderId, stop]);

  return { leaderId, follow: setLeaderId, stop };
}

// The tour names its clients `tour-<name>`.
const LEADER_ID = `tour-${MIRA.name}`;

const clippedPointPolicy: VisibilityPolicy = ({ resolution }) =>
  !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";

const bindingOptions = { resolution: { visibilityPolicy: clippedPointPolicy } };

const bannerButton =
  "flex-none rounded-md px-2 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring";

function FollowBanner() {
  const client = useCursorClient();
  const { leaderId, follow, stop } = useFollowMode();

  // Follows Mira again each time the tour brings her back.
  useEffect(() => {
    follow(LEADER_ID);
    return client?.subscribePeers((change) => {
      if (change.type === "join" && change.clientId === LEADER_ID) follow(LEADER_ID);
    });
  }, [client, follow]);

  if (leaderId === null) {
    return (
      <div className="flex h-9 flex-none items-center gap-2 border-b border-fd-border px-2.5 text-[11px] text-fd-muted-foreground">
        <span className="min-w-0 flex-1 truncate">Follow mode is off.</span>
        <button
          type="button"
          onClick={() => follow(LEADER_ID)}
          className={`${bannerButton} border border-fd-border bg-fd-background text-fd-foreground`}
        >
          Follow {MIRA.name}
        </button>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex h-9 flex-none items-center gap-2 px-2.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: MIRA.color }}
    >
      <span className="min-w-0 flex-1 truncate">Following {MIRA.name}</span>
      <span className="hidden text-white/80 sm:inline">Scroll or Esc stops</span>
      <button type="button" onClick={stop} className={`${bannerButton} bg-black/25 hover:bg-black/35`}>
        Stop
      </button>
    </div>
  );
}

export function FollowScene({ client, layout, children }: Props) {
  return (
    <LiveCursorProvider client={client} bindingOptions={bindingOptions}>
      <LongPage layout={layout} header={layout === "narrow" ? <FollowBanner /> : null} />
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => cursor.user?.color ?? MIRA.color}
      />
      {children}
    </LiveCursorProvider>
  );
}

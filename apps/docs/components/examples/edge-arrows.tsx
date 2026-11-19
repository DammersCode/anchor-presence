"use client";

import type { PresenceClient } from "@anchor-presence/core";
import { CursorLayer, PresenceProvider, useRemoteCursors } from "@anchor-presence/react";
import type { ResolvedCursor } from "@anchor-presence/react";
import type { ReactNode } from "react";
import { LongPage } from "./long-page";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

// Copy of the offscreen-hints.mdx recipe.
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

export function EdgeArrowsScene({ client, layout, children }: Props) {
  return (
    <PresenceProvider client={client}>
      <LongPage layout={layout} />
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {/* The arrows take the status bar's place at the window edge. */}
      {layout === "narrow" ? <OffscreenHints /> : children}
    </PresenceProvider>
  );
}

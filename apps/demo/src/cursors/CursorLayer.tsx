import { useRemoteCursors } from "@anchor-presence/react";
import type { ResolvedCursor } from "@anchor-presence/dom";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "./setup";
import type { DemoContext, DemoUser } from "./setup";

function RemoteCursor({ cursor }: { cursor: ResolvedCursor<DemoContext, DemoUser> }) {
  if (!cursor.visible) return null;

  const name = cursor.user?.name ?? "Guest";
  const color = isKnownCursorColor(cursor.user?.color) ? cursor.user!.color : DEFAULT_CURSOR_COLOR;

  return (
    <div
      data-testid="remote-cursor"
      data-cursor-name={name}
      data-cursor-anchor={cursor.anchorId ?? ""}
      data-cursor-tier={cursor.tier}
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
        <path d="M2 2 L18 9 L10.5 11 L8 18.5 Z" fill={color} stroke="white" strokeWidth="1" />
      </svg>
      <span
        className="ml-3 mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </div>
  );
}

export function CursorLayer() {
  const cursors = useRemoteCursors<DemoContext, DemoUser>();
  return (
    <>
      {cursors.map((cursor) => (
        <RemoteCursor key={cursor.clientId} cursor={cursor} />
      ))}
    </>
  );
}

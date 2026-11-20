import { CursorLayer as PackageCursorLayer } from "./hooks";
import type { CursorRenderProps } from "@dammers/anchor-presence-react";
import type { ResolvedCursor } from "@dammers/anchor-presence-dom";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "./setup";
import type { DemoContext, DemoUser } from "./setup";

type DemoResolvedCursor = ResolvedCursor<DemoContext, DemoUser>;

function getLabel(cursor: DemoResolvedCursor) {
  return cursor.user?.name ?? "Guest";
}

function getColor(cursor: DemoResolvedCursor) {
  return isKnownCursorColor(cursor.user?.color) ? cursor.user!.color : DEFAULT_CURSOR_COLOR;
}

function getCursorProps(cursor: DemoResolvedCursor) {
  return {
    "data-testid": "remote-cursor",
    "data-cursor-name": getLabel(cursor),
    "data-cursor-anchor": cursor.anchorId ?? "",
    "data-cursor-tier": cursor.tier,
    className: "pointer-events-none fixed left-0 top-0",
  };
}

function DemoCursor({ label, color }: CursorRenderProps<DemoContext, DemoUser>) {
  return (
    <>
      <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
        <path d="M2 2 L18 9 L10.5 11 L8 18.5 Z" fill={color} stroke="white" strokeWidth="1" />
      </svg>
      <span
        className="ml-3 mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-xs font-medium text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </>
  );
}

export function CursorLayer() {
  return (
    <PackageCursorLayer
      getLabel={getLabel}
      getColor={getColor}
      getCursorProps={getCursorProps}
      renderCursor={DemoCursor}
    />
  );
}

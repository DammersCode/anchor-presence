import { memo, useCallback } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { CURSOR_MARKER_ATTRIBUTE, type ResolvedCursor } from "@anchor-presence/dom";
import { useRemoteCursorsSelector } from "./hooks";

const DEFAULT_COLOR = "#6b7280";
const DEFAULT_Z_INDEX = 50;

// JSX cannot name an attribute dynamically; the marker wins over consumer props, as before
const CURSOR_MARKER_PROPS: Record<string, string> = { [CURSOR_MARKER_ATTRIBUTE]: "" };

function sameCursors(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export type CursorRenderProps<TContext = unknown, TUser = unknown> = {
  cursor: ResolvedCursor<TContext, TUser>;
  label: ReactNode;
  color: string;
};

export type CursorLayerProps<TContext = unknown, TUser = unknown> = {
  getLabel?: (cursor: ResolvedCursor<TContext, TUser>) => ReactNode;
  getColor?: (cursor: ResolvedCursor<TContext, TUser>) => string;
  filterCursor?: (cursor: ResolvedCursor<TContext, TUser>) => boolean;
  getCursorProps?: (cursor: ResolvedCursor<TContext, TUser>) => Omit<ComponentPropsWithoutRef<"div">, "children">;
  renderCursor?: (props: CursorRenderProps<TContext, TUser>) => ReactNode;
};

export type DefaultCursorProps = {
  label?: ReactNode;
  color?: string;
  className?: string;
  style?: CSSProperties &
    Partial<
      Record<
        "--anchor-presence-cursor-color" | "--anchor-presence-cursor-size" | "--anchor-presence-cursor-label-color",
        string
      >
    >;
  labelClassName?: string;
  labelStyle?: CSSProperties;
};

export function DefaultCursor(props: DefaultCursorProps): ReactNode {
  const { label, color = DEFAULT_COLOR, className, style, labelClassName, labelStyle } = props;
  const cssColor = `var(--anchor-presence-cursor-color, ${color})`;
  const cssSize = "var(--anchor-presence-cursor-size, 20px)";
  const cssLabelColor = "var(--anchor-presence-cursor-label-color, white)";

  return (
    <span className={className} style={style}>
      {/* size via CSS properties: var() does not resolve in SVG presentation attributes */}
      <svg style={{ width: cssSize, height: cssSize }} viewBox="0 0 20 20">
        <path d="M2 2 L18 9 L10.5 11 L8 18.5 Z" fill={cssColor} stroke="white" strokeWidth={1} />
      </svg>
      {label !== null && label !== undefined ? (
        <span
          className={labelClassName}
          style={{
            marginLeft: 12,
            display: "inline-block",
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: 12,
            fontWeight: 500,
            color: cssLabelColor,
            backgroundColor: cssColor,
            ...labelStyle,
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

type CursorItemProps<TContext = unknown, TUser = unknown> = {
  cursor: ResolvedCursor<TContext, TUser>;
  getLabel?: ((cursor: ResolvedCursor<TContext, TUser>) => ReactNode) | undefined;
  getColor?: ((cursor: ResolvedCursor<TContext, TUser>) => string) | undefined;
  getCursorProps?:
    | ((cursor: ResolvedCursor<TContext, TUser>) => Omit<ComponentPropsWithoutRef<"div">, "children">)
    | undefined;
  renderCursor?: ((props: CursorRenderProps<TContext, TUser>) => ReactNode) | undefined;
};

function CursorItem<TContext = unknown, TUser = unknown>(props: CursorItemProps<TContext, TUser>): ReactNode {
  const { cursor, getLabel, getColor, getCursorProps, renderCursor } = props;
  const label = getLabel ? getLabel(cursor) : null;
  const color = getColor ? getColor(cursor) : DEFAULT_COLOR;
  const consumerProps = getCursorProps ? getCursorProps(cursor) : undefined;
  const { style: consumerStyle, ...consumerRest } = consumerProps ?? {};

  const style: CSSProperties = {
    zIndex: DEFAULT_Z_INDEX,
    ...consumerStyle,
    position: "fixed",
    left: 0,
    top: 0,
    pointerEvents: "none",
    transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
  };

  return (
    <div
      {...consumerRest}
      {...CURSOR_MARKER_PROPS}
      style={style}
      aria-hidden="true"
      data-anchor-presence-client-id={cursor.clientId}
      data-anchor-presence-tier={cursor.tier}
      data-anchor-presence-anchor={cursor.anchorId ?? ""}
    >
      {renderCursor ? renderCursor({ cursor, label, color }) : <DefaultCursor label={label} color={color} />}
    </div>
  );
}

// the resolver keeps result-object identity for unchanged cursors (spec §14.1), so memo skips static cursors for free
const MemoizedCursorItem = memo(CursorItem) as typeof CursorItem;

export function CursorLayer<TContext = unknown, TUser = unknown>(
  props: CursorLayerProps<TContext, TUser>,
): ReactNode {
  const { getLabel, getColor, filterCursor, getCursorProps, renderCursor } = props;

  const select = useCallback(
    (cursors: ResolvedCursor<TContext, TUser>[]) =>
      cursors.filter((cursor) => cursor.visible && (filterCursor?.(cursor) ?? true)),
    [filterCursor],
  );
  const filtered = useRemoteCursorsSelector(select, sameCursors);

  return (
    <>
      {filtered.map((cursor) => (
        <MemoizedCursorItem
          key={cursor.clientId}
          cursor={cursor}
          getLabel={getLabel}
          getColor={getColor}
          getCursorProps={getCursorProps}
          renderCursor={renderCursor}
        />
      ))}
    </>
  );
}

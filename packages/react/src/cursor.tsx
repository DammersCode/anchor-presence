import { memo, useCallback } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import type { PointerType } from "@dammers/anchor-presence-core";
import { CURSOR_MARKER_ATTRIBUTE, type ResolvedCursor } from "@dammers/anchor-presence-dom";
import { PresenceProviderContext } from "./context.js";
import type { PresenceContext } from "./context.js";
import { useRemoteCursorsSelectorIn } from "./hooks/use-remote-cursors.js";

const DEFAULT_COLOR = "#6b7280";
const MAX_DEFAULT_LABEL_LENGTH = 32;
const DEFAULT_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#047857",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0e7490",
  "#4b5563",
];

const graphemeSegmenter =
  typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function truncateLabel(name: string): string {
  const units: string[] = [];
  const parts = graphemeSegmenter === null ? name : graphemeSegmenter.segment(name);
  for (const part of parts) {
    if (units.length === MAX_DEFAULT_LABEL_LENGTH) break;
    units.push(typeof part === "string" ? part : part.segment);
  }
  return units.join("");
}

function defaultLabel(cursor: ResolvedCursor): string | null {
  const user = cursor.user;
  const name = typeof user === "object" && user !== null && "name" in user ? user.name : undefined;
  return typeof name === "string" && name !== "" ? truncateLabel(name) : null;
}

function defaultColor(cursor: ResolvedCursor): string {
  let hash = 0;
  for (const char of cursor.clientId) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length] ?? DEFAULT_COLOR;
}
const DEFAULT_Z_INDEX = 9999;
const IDLE_OPACITY = 0.4;

// JSX cannot name an attribute dynamically. The marker wins over consumer props.
const CURSOR_MARKER_PROPS: Record<string, string> = { [CURSOR_MARKER_ATTRIBUTE]: "" };

// One MediaQueryList per matchMedia implementation; .matches stays live, so no listener is needed.
let cachedMatchMedia: typeof window.matchMedia | null | undefined;
let cachedReducedMotionQuery: MediaQueryList | null = null;
function prefersReducedMotion(): boolean {
  const matchMedia = typeof window !== "undefined" ? window.matchMedia : undefined;
  if (matchMedia !== cachedMatchMedia) {
    cachedMatchMedia = matchMedia;
    cachedReducedMotionQuery =
      typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return cachedReducedMotionQuery?.matches ?? false;
}

function sameCursors(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Props that `renderCursor` receives.
 */
export type CursorRenderProps<TContext = unknown, TUser = unknown> = {
  /** The resolved cursor to render. */
  cursor: ResolvedCursor<TContext, TUser>;
  /** The label, from `getLabel`. `null` hides the label. */
  label: ReactNode;
  /** The color, from `getColor`. */
  color: string;
  /** The pointer type that moved the cursor. `undefined` when the sender sent no pointer type. */
  pointerType?: PointerType | undefined;
};

/**
 * Props for `CursorLayer`.
 */
export type CursorLayerProps<TContext = unknown, TUser = unknown> = {
  /** Returns the label to show for one cursor. */
  getLabel?: ((cursor: ResolvedCursor<TContext, TUser>) => ReactNode) | undefined;
  /** Returns the color for one cursor. */
  getColor?: ((cursor: ResolvedCursor<TContext, TUser>) => string) | undefined;
  /** Hides a cursor when it returns `false`. Default: show every visible cursor. */
  filterCursor?: ((cursor: ResolvedCursor<TContext, TUser>) => boolean) | undefined;
  /** Returns extra props for the cursor element. */
  getCursorProps?:
    | ((cursor: ResolvedCursor<TContext, TUser>) => Omit<ComponentPropsWithoutRef<"div">, "children">)
    | undefined;
  /** Renders one cursor. Default: the `DefaultCursor` component. */
  renderCursor?: ((props: CursorRenderProps<TContext, TUser>) => ReactNode) | undefined;
  /** The z-index for the cursor elements. Default `9999`. */
  zIndex?: number | undefined;
};

/**
 * Props for `DefaultCursor`.
 */
export type DefaultCursorProps = {
  /** The label text to show next to the arrow. */
  label?: ReactNode;
  /** The arrow color. Default `#6b7280`. */
  color?: string | undefined;
  /** A class name for the outer element. */
  className?: string | undefined;
  /** Inline styles for the outer element. */
  style?:
    | (CSSProperties &
        Partial<
          Record<
            | "--anchor-presence-cursor-color"
            | "--anchor-presence-cursor-size"
            | "--anchor-presence-cursor-label-color",
            string
          >
        >)
    | undefined;
  /** A class name for the label element. */
  labelClassName?: string | undefined;
  /** Inline styles for the label element. */
  labelStyle?: CSSProperties | undefined;
};

/**
 * The default cursor shape: an arrow with an optional label.
 */
export function DefaultCursor(props: DefaultCursorProps): ReactNode {
  const { label, color = DEFAULT_COLOR, className, style, labelClassName, labelStyle } = props;
  const cssColor = `var(--anchor-presence-cursor-color, ${color})`;
  const cssSize = "var(--anchor-presence-cursor-size, 20px)";
  const cssLabelColor = "var(--anchor-presence-cursor-label-color, white)";

  return (
    // forced-color-adjust keeps the cursor's own colors under forced-colors mode instead of flattening to system colors
    <span className={className} dir="ltr" style={{ forcedColorAdjust: "none", ...style }}>
      {/* size via CSS properties: var() does not resolve in SVG presentation attributes */}
      <svg style={{ width: cssSize, height: cssSize }} viewBox="0 0 20 20">
        <path d="M2 2 L18 9 L10.5 11 L8 18.5 Z" fill={cssColor} stroke="white" strokeWidth={1} />
      </svg>
      {label !== null && label !== undefined ? (
        <span
          dir="auto"
          className={labelClassName}
          style={{
            marginLeft: 12,
            display: "inline-block",
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: "0.75rem",
            fontWeight: 500,
            color: cssLabelColor,
            backgroundColor: cssColor,
            maxWidth: "20rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
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
  zIndex?: number | undefined;
};

function CursorItem<TContext = unknown, TUser = unknown>(props: CursorItemProps<TContext, TUser>): ReactNode {
  const { cursor, getLabel, getColor, getCursorProps, renderCursor, zIndex } = props;
  const label = getLabel ? getLabel(cursor) : defaultLabel(cursor);
  const color = getColor ? getColor(cursor) : defaultColor(cursor);
  const consumerProps = getCursorProps ? getCursorProps(cursor) : undefined;
  const { style: consumerStyle, ...consumerRest } = consumerProps ?? {};

  const style: CSSProperties = {
    ...consumerStyle,
    zIndex: zIndex ?? consumerStyle?.zIndex ?? DEFAULT_Z_INDEX,
    position: "fixed",
    left: 0,
    top: 0,
    pointerEvents: "none",
    transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
    opacity: cursor.idle ? IDLE_OPACITY : 1,
    ...(prefersReducedMotion()
      ? null
      : { transition: consumerStyle?.transition ?? "opacity 200ms ease-out" }),
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
      data-anchor-presence-idle={cursor.idle || undefined}
    >
      {renderCursor ? (
        renderCursor({ cursor, label, color, pointerType: cursor.pointerType })
      ) : (
        <DefaultCursor label={label} color={color} />
      )}
    </div>
  );
}

// the resolver keeps result-object identity for unchanged cursors (spec §14.1), so memo skips static cursors for free
const MemoizedCursorItem = memo(CursorItem) as typeof CursorItem;

type CursorLayerInProps<TContext, TUser, TEvents extends object> = CursorLayerProps<TContext, TUser> & {
  context: PresenceContext<TContext, TUser, TEvents>;
};

export function CursorLayerIn<TContext, TUser, TEvents extends object>(
  props: CursorLayerInProps<TContext, TUser, TEvents>,
): ReactNode {
  const { context, getLabel, getColor, filterCursor, getCursorProps, renderCursor, zIndex } = props;

  const select = useCallback(
    (cursors: readonly ResolvedCursor<TContext, TUser>[]) =>
      cursors.filter((cursor) => cursor.visible && (filterCursor?.(cursor) ?? true)),
    [filterCursor],
  );
  const filtered = useRemoteCursorsSelectorIn(context, select, sameCursors);

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
          zIndex={zIndex}
        />
      ))}
    </>
  );
}

/**
 * Renders the visible remote cursors.
 * The layer places each cursor at its resolved position.
 * The `user` and `context` of a cursor have the type `unknown`. For typed render props, use `CursorLayer` from `createPresenceHooks`.
 */
export function CursorLayer(props: CursorLayerProps): ReactNode {
  return <CursorLayerIn {...props} context={PresenceProviderContext} />;
}

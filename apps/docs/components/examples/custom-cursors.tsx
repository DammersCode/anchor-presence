"use client";

import type { PresenceClient } from "@dammers/anchor-presence-core";
import type { TourContext } from "./_preview/tour";
import type { CursorRenderProps } from "@dammers/anchor-presence-react";
import { CursorLayer, PresenceProvider } from "./_preview/hooks";
import { useState, type ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<TourContext, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

type Renderer = "arrow" | "pill" | "avatar" | "crosshair";

const isRenderer = (value: string): value is Renderer => Object.hasOwn(RENDERERS, value);

type RenderCursor = (props: CursorRenderProps<unknown, User>) => ReactNode;

// CursorLayer places each root at the cursor point, so every renderer draws relative to (0, 0).
const RENDERERS: Record<Renderer, { label: string; render?: RenderCursor }> = {
  arrow: { label: "Default arrow" },
  pill: {
    label: "Name pill",
    render: ({ label, color }) => (
      <span className="flex items-start gap-0.5">
        <span className="mt-0.5 size-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-md"
          style={{ backgroundColor: color }}
        >
          {label}
        </span>
      </span>
    ),
  },
  avatar: {
    label: "Avatar",
    render: ({ cursor, color }) => (
      <span
        className="grid size-7 place-items-center rounded-full rounded-tl-none text-[11px] font-bold text-white shadow-md ring-2 ring-white"
        style={{ backgroundColor: color }}
      >
        {(cursor.user?.name ?? "?").slice(0, 2)}
      </span>
    ),
  },
  crosshair: {
    label: "Crosshair",
    render: ({ cursor, label, color }) => (
      <span className="relative block" style={{ color }}>
        <svg viewBox="0 0 32 32" className="absolute -top-4 -left-4 size-8" aria-hidden="true">
          <path d="M16 2v10M16 20v10M2 16h10M20 16h10" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
        </svg>
        <span className="absolute top-3 left-3 font-mono text-[10px] font-semibold whitespace-nowrap">
          {label} {Math.round(cursor.x)},{Math.round(cursor.y)}
        </span>
      </span>
    ),
  },
};

export function CustomCursorsScene({ client, layout, children }: Props) {
  const wide = layout === "wide";
  const [renderer, setRenderer] = useState<Renderer>(wide ? "pill" : "avatar");

  return (
    <PresenceProvider client={client}>
      <div className="flex h-full flex-col gap-2 p-2.5">
        <label className="flex items-center justify-between gap-2 text-[11px] text-fd-muted-foreground">
          Remote cursor style
          <select
            value={renderer}
            onChange={(event) => {
              if (isRenderer(event.target.value)) setRenderer(event.target.value);
            }}
            className="rounded-md border border-fd-border bg-fd-background px-1.5 py-1 text-[11px] text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring"
          >
            {Object.entries(RENDERERS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div
          data-anchor="canvas"
          className={`grid min-h-0 flex-1 gap-2 rounded-lg border border-fd-border bg-fd-background p-2.5 bg-[radial-gradient(var(--color-fd-border)_1px,transparent_1px)] bg-size-[12px_12px] ${wide ? "grid-cols-[2fr_1fr] grid-rows-[1fr_auto_auto]" : "grid-cols-2 grid-rows-[1fr_auto_auto]"}`}
        >
          <div
            data-anchor="canvas.hero"
            className={`flex flex-col justify-end rounded-md bg-gradient-brand p-2.5 text-white ${wide ? "row-span-3" : "col-span-2"}`}
          >
            <span className="font-display text-sm font-bold">Hero banner</span>
            <span className="text-[10px] opacity-80">1440 × 720</span>
          </div>
          <div
            data-anchor="canvas.logo"
            className="grid size-14 place-items-center self-center justify-self-center rounded-full border-2 border-dashed border-indigo-400 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
          >
            Logo
          </div>
          <button
            type="button"
            data-anchor="canvas.button"
            className="self-center rounded-full bg-fd-primary px-3 py-1.5 text-[11px] font-semibold text-fd-primary-foreground"
          >
            Get started
          </button>
          <div
            data-anchor="canvas.note"
            className={`rounded-md bg-amber-200 p-1.5 text-[10px] leading-snug text-amber-950 shadow-sm ${wide ? "" : "col-span-2"}`}
          >
            Make the button bigger?
          </div>
        </div>
      </div>
      <CursorLayer
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
        renderCursor={RENDERERS[renderer].render}
      />
      {children}
    </PresenceProvider>
  );
}

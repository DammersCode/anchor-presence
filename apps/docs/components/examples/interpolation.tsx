"use client";

import { linearInterpolator, noneInterpolator } from "@anchor-presence/core";
import type { Interpolator, InterpolatorFactory, PresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, useRemoteCursors } from "@anchor-presence/react";
import { useEffect, useState, type ReactNode } from "react";
import { safeColor } from "./safe-color";

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const SETTLE_SPEED = 0.05; // px per ms
const SETTLE_DISTANCE = 0.05; // px
const MAX_STEP_MS = 64; // a stalled tab must not fling the spring

/** A damped spring. `target` keeps the velocity, so a new target mid-flight curves instead of restarting. */
const springInterpolator = (stiffness = 120, damping = 13): Interpolator => {
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;
  let velocityX = 0;
  let velocityY = 0;
  let lastMs = 0;
  let started = false;
  let settled = true;

  return {
    target(nextX, nextY, timestampMs) {
      if (!started) {
        x = nextX;
        y = nextY;
        started = true;
        lastMs = timestampMs;
      } else {
        if (settled) lastMs = timestampMs;
        settled = false;
      }
      targetX = nextX;
      targetY = nextY;
    },
    shift(dx, dy) {
      x += dx;
      y += dy;
      targetX += dx;
      targetY += dy;
    },
    sample(timestampMs) {
      const dt = Math.min(Math.max(timestampMs - lastMs, 0), MAX_STEP_MS) / 1000;
      lastMs = timestampMs;
      if (settled) return { x, y, settled };

      velocityX += (-stiffness * (x - targetX) - damping * velocityX) * dt;
      velocityY += (-stiffness * (y - targetY) - damping * velocityY) * dt;
      x += velocityX * dt;
      y += velocityY * dt;

      const speed = Math.hypot(velocityX, velocityY) / 1000;
      if (speed < SETTLE_SPEED && Math.hypot(x - targetX, y - targetY) < SETTLE_DISTANCE) {
        x = targetX;
        y = targetY;
        velocityX = 0;
        velocityY = 0;
        settled = true;
      }
      return { x, y, settled };
    },
  };
};

type Style = "none" | "linear" | "spring";

const INTERPOLATORS: Record<Style, InterpolatorFactory> = {
  none: noneInterpolator,
  linear: () => linearInterpolator(360),
  spring: () => springInterpolator(),
};

const TARGETS = [
  { id: "a", place: "col-start-1 row-start-1 self-start justify-self-start" },
  { id: "b", place: "col-start-2 row-start-1 self-start justify-self-end" },
  { id: "c", place: "col-start-2 row-start-2 self-end justify-self-end" },
  { id: "d", place: "col-start-1 row-start-2 self-end justify-self-start" },
];

const TRAIL_LENGTH = 28;

/** Dots on the last positions of the first remote cursor, so the path of each glide stays visible. */
function MotionTrail() {
  const cursor = useRemoteCursors<unknown, User>().find((candidate) => candidate.visible);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const x = cursor?.x;
  const y = cursor?.y;

  useEffect(() => {
    if (x === undefined || y === undefined) return;
    setTrail((points) => [...points.slice(1 - TRAIL_LENGTH), { x, y }]);
  }, [x, y]);

  return (
    <svg aria-hidden="true" className="pointer-events-none fixed inset-0 size-full">
      {trail.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={2.5}
          fill={safeColor(cursor?.user?.color, "#4f46e5")}
          opacity={(index + 1) / trail.length / 2}
        />
      ))}
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function InterpolationScene({ client, layout, children }: Props) {
  const wide = layout === "wide";
  const [style, setStyle] = useState<Style>(() => (wide || prefersReducedMotion() ? "none" : "spring"));

  return (
    <LiveCursorProvider
      client={client}
      bindingKey={style}
      bindingOptions={{ resolution: { interpolatorFactory: INTERPOLATORS[style] } }}
    >
      <div className="flex h-full flex-col gap-2 p-2.5">
        <div className="flex h-7 items-center justify-between gap-2 text-[11px] text-fd-muted-foreground">
          <span>{wide ? "Each update lands as it arrives" : "Glide between updates"}</span>
          {wide ? null : (
            <select
              aria-label="Interpolator"
              value={style}
              onChange={(event) => setStyle(event.target.value as Style)}
              className="rounded-md border border-fd-border bg-fd-background px-1.5 py-1 text-[11px] text-fd-foreground focus-visible:outline-2 focus-visible:outline-fd-ring"
            >
              <option value="none">none</option>
              <option value="linear">linear (360 ms)</option>
              <option value="spring">spring (app code)</option>
            </select>
          )}
        </div>
        <div
          data-anchor="field"
          className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 rounded-lg border border-fd-border bg-fd-background p-3 bg-[linear-gradient(var(--color-fd-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-fd-border)_1px,transparent_1px)] bg-size-[24px_24px]"
        >
          {TARGETS.map((target) => (
            <div
              key={target.id}
              data-anchor={`field.target:${target.id}`}
              className={`grid size-11 place-items-center rounded-full border-2 border-indigo-500/60 bg-fd-card font-display text-sm font-bold text-indigo-600 uppercase shadow-sm dark:text-indigo-300 ${target.place}`}
            >
              {target.id}
            </div>
          ))}
        </div>
      </div>
      <MotionTrail />
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </LiveCursorProvider>
  );
}

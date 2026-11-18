"use client";

import type { PresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider } from "@anchor-presence/react";
import type { ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

type Metric = { id: string; label: string; value: string; delta: string; up: boolean };

const TRAFFIC = [
  { day: "mon", visits: 38 },
  { day: "tue", visits: 52 },
  { day: "wed", visits: 46 },
  { day: "thu", visits: 64 },
  { day: "fri", visits: 81 },
  { day: "sat", visits: 57 },
  { day: "sun", visits: 42 },
];

const SMALL_METRICS: Metric[] = [
  { id: "orders", label: "Orders", value: "1,204", delta: "+4%", up: true },
  { id: "refunds", label: "Refunds", value: "18", delta: "−2", up: true },
  { id: "conversion", label: "Conversion", value: "3.4%", delta: "+0.3", up: true },
  { id: "churn", label: "Churn", value: "1.2%", delta: "+0.1", up: false },
  { id: "active", label: "Active now", value: "312", delta: "+27", up: true },
  { id: "aov", label: "Avg. order", value: "$40", delta: "−$1", up: false },
];

// Both layouts render the same cards with the same anchor IDs. Only the columns and spans change.
const SPANS = {
  wide: { grid: "grid-cols-4 grid-rows-3", revenue: "col-span-2", traffic: "col-span-2 row-span-2" },
  narrow: {
    grid: "grid-cols-2 grid-rows-[auto_auto_1fr_auto_auto]",
    revenue: "col-span-2",
    traffic: "col-span-2",
  },
};

function MetricCard({ metric, compact }: { metric: Metric; compact: boolean }) {
  return (
    <div
      data-anchor={`metrics.${metric.id}`}
      className={`flex min-w-0 justify-between rounded-lg border border-fd-border bg-fd-background px-2.5 ${compact ? "items-baseline gap-2 py-1.5" : "flex-col py-2"}`}
    >
      <span className="truncate text-[10px] font-medium tracking-wide text-fd-muted-foreground uppercase">
        {metric.label}
      </span>
      <span className="flex items-baseline justify-between gap-1">
        <span className={`font-display font-semibold ${compact ? "text-sm" : "text-lg"}`}>
          {metric.value}
        </span>
        {compact ? null : (
          <span
            className={`text-[10px] font-medium ${metric.up ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
          >
            {metric.delta}
          </span>
        )}
      </span>
    </div>
  );
}

export function ResponsiveGridScene({ client, layout, children }: Props) {
  const spans = SPANS[layout];
  const compact = layout === "narrow";

  return (
    <LiveCursorProvider client={client}>
      <div data-anchor="metrics" className={`grid h-full gap-1.5 p-2.5 ${spans.grid}`}>
        <div
          data-anchor="metrics.revenue"
          className={`flex min-w-0 items-center justify-between gap-3 rounded-lg bg-gradient-brand px-3 py-2 text-white ${spans.revenue}`}
        >
          <span className="flex flex-col">
            <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">Revenue</span>
            <span className={`font-display font-bold ${compact ? "text-base" : "text-2xl"}`}>$48.2k</span>
          </span>
          <svg viewBox="0 0 80 28" className="h-7 w-20 flex-none" aria-hidden="true">
            <polyline
              points="0,24 12,20 24,22 36,14 48,16 60,8 72,10 80,3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {SMALL_METRICS.slice(0, 2).map((metric) => (
          <MetricCard key={metric.id} metric={metric} compact={compact} />
        ))}
        <div
          data-anchor="metrics.traffic"
          className={`flex min-w-0 flex-col rounded-lg border border-fd-border bg-fd-background px-2.5 pt-2 pb-1.5 ${spans.traffic}`}
        >
          <span className="text-[10px] font-medium tracking-wide text-fd-muted-foreground uppercase">
            Visits this week
          </span>
          <div className="mt-1 flex min-h-0 flex-1 gap-1">
            {TRAFFIC.map(({ day, visits }) => (
              <div
                key={day}
                data-anchor={`metrics.traffic.${day}`}
                className="flex flex-1 flex-col items-center"
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-sm bg-indigo-500/70 dark:bg-indigo-400/70"
                    style={{ height: `${visits}%` }}
                  />
                </div>
                <span className="mt-0.5 text-[9px] text-fd-muted-foreground capitalize">
                  {day.slice(0, 2)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {SMALL_METRICS.slice(2).map((metric) => (
          <MetricCard key={metric.id} metric={metric} compact={compact} />
        ))}
      </div>
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </LiveCursorProvider>
  );
}

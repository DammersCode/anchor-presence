"use client";

import { useEffect, useMemo } from "react";
import { createPresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, usePresenceClient } from "@anchor-presence/react";
import { createBroadcastChannelTransport } from "./broadcast-transport";

const CURSOR_COLORS = { alice: "#c2410c", bob: "#0f766e" }; // both pass WCAG AA against a white label

export type DemoVariant = "wide" | "narrow";

/**
 * The scene both demo panes render. Same anchors (`data-anchor`), different layout per
 * variant, proving the cursor tracks the element and not a pixel position.
 */
export function DemoScene({
  variant,
  channel,
  name,
}: {
  variant: DemoVariant;
  channel: string;
  name: string;
}) {
  const transport = useMemo(() => createBroadcastChannelTransport(channel), [channel]);
  const client = usePresenceClient({
    key: `${channel}-${name}`,
    factory: () => {
      transport.connect();
      return createPresenceClient({
        transport,
        user: { name, color: CURSOR_COLORS[name as "alice" | "bob"] },
      });
    },
  });

  useEffect(() => {
    return () => {
      transport.disconnect();
    };
  }, [transport]);

  const sidebarWidth = variant === "wide" ? "w-40" : "w-14";

  return (
    <LiveCursorProvider client={client}>
      <div
        className="relative flex h-64 overflow-hidden rounded-lg border border-fd-border bg-fd-card text-xs select-none"
        onPointerMove={() => {
          /* pointer capture is wired by the binding itself; this only proves the pane is interactive */
        }}
      >
        <div
          className={`flex ${sidebarWidth} flex-none flex-col gap-2 border-r border-fd-border bg-fd-secondary/40 p-2`}
        >
          <div
            data-anchor="nav.dashboard"
            className="rounded bg-gradient-brand px-2 py-1.5 font-medium text-white"
          >
            {variant === "wide" ? "Dashboard" : "D"}
          </div>
          <div data-anchor="nav.orders" className="rounded px-2 py-1.5 text-fd-muted-foreground">
            {variant === "wide" ? "Orders" : "O"}
          </div>
          <div data-anchor="nav.customers" className="rounded px-2 py-1.5 text-fd-muted-foreground">
            {variant === "wide" ? "Customers" : "C"}
          </div>
        </div>
        <div data-anchor="main" className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          <div data-anchor="stats.revenue" className="rounded bg-fd-secondary/60 px-3 py-2 font-medium">
            Revenue · $48.2k
          </div>
          <div data-anchor="stats.orders" className="rounded bg-fd-secondary/60 px-3 py-2 font-medium">
            Orders · 1,204
          </div>
          <div data-anchor="orders.row:10482" className="rounded border border-fd-border px-3 py-2">
            #10482 · A. Rivera
          </div>
        </div>
        <CursorLayer />
      </div>
      <p className="mt-1 text-center text-[11px] text-fd-muted-foreground">
        {variant === "wide" ? "wide layout · sidebar expanded" : "narrow layout · sidebar collapsed"}
      </p>
    </LiveCursorProvider>
  );
}

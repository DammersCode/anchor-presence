"use client";

import { createPresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, usePresenceClient } from "@anchor-presence/react";
import { createBroadcastChannelTransport } from "./broadcast-transport";

const CURSOR_COLORS = { alice: "#c2410c", bob: "#0f766e" }; // both pass WCAG AA against a white label

export type DemoVariant = "wide" | "narrow";

type DemoUser = { name: string; color: string };

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
  // The client owns the transport; the iframe's unload closes both.
  const client = usePresenceClient({
    key: `${channel}-${name}`,
    factory: () => {
      const transport = createBroadcastChannelTransport(channel);
      transport.connect();
      return createPresenceClient({
        transport,
        user: { name, color: CURSOR_COLORS[name as "alice" | "bob"] },
      });
    },
  });

  const sidebarWidth = variant === "wide" ? "w-40" : "w-14";

  return (
    <LiveCursorProvider client={client}>
      <div className="flex h-full flex-col">
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-fd-border bg-fd-card text-xs select-none">
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
          <CursorLayer<unknown, DemoUser>
            getLabel={(cursor) => cursor.user?.name ?? null}
            getColor={(cursor) => cursor.user?.color ?? "#4f46e5"}
          />
        </div>
        <p className="mt-1 text-center text-[11px] text-fd-muted-foreground">
          {variant === "wide" ? "wide layout · sidebar expanded" : "narrow layout · sidebar collapsed"}
        </p>
      </div>
    </LiveCursorProvider>
  );
}

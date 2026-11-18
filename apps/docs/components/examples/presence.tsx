"use client";

import type { PresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, useRemoteUsers } from "@anchor-presence/react";
import type { ReactNode } from "react";

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

// Short timeouts show idle and leave in seconds. Idle counts from the last change, so a still user turns idle while heartbeats continue.
export const presenceTimeouts = { heartbeatMs: 1500, idleAfterMs: 2500, staleTimeoutMs: 8000 };

const COLUMNS = [
  {
    id: "now",
    title: "Now",
    cards: [
      { id: "auth", title: "SSO login" },
      { id: "search", title: "Search filters" },
    ],
  },
  {
    id: "next",
    title: "Next",
    cards: [
      { id: "billing", title: "Usage billing" },
      { id: "export", title: "CSV export" },
    ],
  },
  {
    id: "later",
    title: "Later",
    cards: [
      { id: "onboarding", title: "Onboarding tour" },
      { id: "docs", title: "API docs refresh" },
    ],
  },
];

function WhoIsOnline({ compact }: { compact: boolean }) {
  const users = useRemoteUsers<User>();

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {users.map(({ clientId, user, idle }) => (
            <span
              key={clientId}
              title={user?.name ?? "Guest"}
              className="grid size-5 place-items-center rounded-full text-[9px] font-semibold text-white ring-2 ring-fd-card transition-opacity"
              style={{ backgroundColor: user?.color ?? "#6b7280", opacity: idle ? 0.35 : 1 }}
            >
              {(user?.name ?? "?").charAt(0)}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-fd-muted-foreground">{users.length} here</span>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {users.length === 0 ? <li className="text-[11px] text-fd-muted-foreground">Only you</li> : null}
      {users.map(({ clientId, user, idle }) => (
        <li
          key={clientId}
          className="flex items-center gap-1 rounded-full border border-fd-border py-0.5 pr-2 pl-0.5 text-[11px] transition-opacity"
          style={{ opacity: idle ? 0.45 : 1 }}
        >
          <span
            className="grid size-4 place-items-center rounded-full text-[9px] font-semibold text-white"
            style={{ backgroundColor: user?.color ?? "#6b7280" }}
          >
            {(user?.name ?? "?").charAt(0)}
          </span>
          {user?.name ?? "Guest"}
          {idle ? <span className="text-fd-muted-foreground">away</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function PresenceScene({ client, layout, children }: Props) {
  const wide = layout === "wide";

  return (
    <LiveCursorProvider client={client}>
      <div data-anchor="board" className="flex h-full flex-col gap-2 p-2.5">
        <header className="flex min-h-7 items-center justify-between gap-2 border-b border-fd-border pb-2">
          <h3 className="font-display flex-none text-sm font-semibold">Roadmap</h3>
          <WhoIsOnline compact={!wide} />
        </header>
        <div className={`grid min-h-0 flex-1 gap-2 ${wide ? "grid-cols-3" : "grid-cols-1"}`}>
          {COLUMNS.map((column) => (
            <section
              key={column.id}
              data-anchor={`board.column:${column.id}`}
              className={`flex min-w-0 gap-1.5 rounded-lg bg-fd-secondary/60 p-1.5 ${wide ? "flex-col" : "items-center"}`}
            >
              <h4
                className={`px-1 text-[10px] font-semibold tracking-wide text-fd-muted-foreground uppercase ${wide ? "" : "w-10 flex-none"}`}
              >
                {column.title}
              </h4>
              {column.cards.map((card) => (
                <div
                  key={card.id}
                  data-anchor={`board.card:${card.id}`}
                  className={`min-w-0 truncate rounded-md border border-fd-border bg-fd-background px-2 text-xs font-medium shadow-xs ${wide ? "py-2.5" : "flex-1 py-1.5"}`}
                >
                  {card.title}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => cursor.user?.color ?? "#4f46e5"}
      />
      {children}
    </LiveCursorProvider>
  );
}

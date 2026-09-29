"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { VisibilityPolicy } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider } from "@anchor-presence/react";
import { UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type User = { name: string; color: string };
type DialogContext = { dialog: "invite" | null };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const MEMBERS = [
  { id: "ada", name: "Ada", role: "Eng" },
  { id: "grace", name: "Grace", role: "Design" },
  { id: "linus", name: "Linus", role: "Infra" },
  { id: "margaret", name: "Margaret", role: "QA" },
];

// The invite dialog loops so the tour can point inside it while it is open.
const FIRST_OPEN_MS = 2500;
const OPEN_MS = 10000;
const GAP_MS = 5000;

export function DialogsScene({ client, layout, children }: Props) {
  const wide = layout === "wide";
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;

  // The preview frame builds the client with an unknown context; the tour publishes DialogContext.
  const typedClient = client as PresenceClient<DialogContext, User> | null;

  const policy: VisibilityPolicy<DialogContext> = ({ presence, resolution }) => {
    if (resolution.tier === "hidden") return "hide";
    // The sender is inside a dialog this pane has not opened.
    if (presence.context?.dialog === "invite" && !dialogOpenRef.current) return "hide";
    // This pane's dialog is open; a cursor outside the dialog belongs to the covered layer.
    if (dialogOpenRef.current && !resolution.anchorId?.startsWith("team.dialog.invite")) return "hide";
    return "show";
  };

  useEffect(() => {
    if (!wide) return;
    let openTimer: ReturnType<typeof setTimeout>;
    let closeTimer: ReturnType<typeof setTimeout>;
    const open = () => {
      setDialogOpen(true);
      closeTimer = setTimeout(close, OPEN_MS);
    };
    const close = () => {
      setDialogOpen(false);
      openTimer = setTimeout(open, GAP_MS);
    };
    openTimer = setTimeout(open, FIRST_OPEN_MS);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [wide]);

  return (
    <LiveCursorProvider<DialogContext, User>
      client={typedClient}
      bindingOptions={{ resolution: { visibilityPolicy: policy } }}
    >
      <div data-anchor="team" className="relative flex h-full flex-col gap-2 p-2.5">
        <header className="flex items-center justify-between gap-2 border-b border-fd-border pb-2">
          <h3 className="font-display text-sm font-semibold">Team</h3>
          {wide ? (
            <button
              type="button"
              data-anchor="team.action.invite"
              className="inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-background px-2 py-1 text-[11px] font-medium hover:bg-fd-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              <UserPlus className="size-3" aria-hidden="true" /> Invite
            </button>
          ) : null}
        </header>
        <div className={`grid min-h-0 flex-1 content-start gap-2 ${wide ? "grid-cols-2" : "grid-cols-1"}`}>
          {MEMBERS.map((member) => (
            <div
              key={member.id}
              data-anchor={`team.card:${member.id}`}
              className="flex items-center gap-2 rounded-md border border-fd-border bg-fd-background px-2.5 py-2 shadow-xs"
            >
              <span className="grid size-6 flex-none place-items-center rounded-full bg-fd-secondary text-[11px] font-semibold">
                {member.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{member.name}</span>
              <span className="text-[11px] text-fd-muted-foreground">{member.role}</span>
            </div>
          ))}
        </div>
        <p className="pt-1 text-[11px] text-fd-muted-foreground">
          The policy hides a cursor whose layer does not match this pane's dialog.
        </p>
        {dialogOpen ? (
          <div
            data-anchor="team.dialog.invite"
            className="absolute inset-0 z-50 flex items-center justify-center bg-fd-background/70 p-4"
          >
            <div className="w-full max-w-56 rounded-lg border border-fd-border bg-fd-card p-3 shadow-lg">
              <div data-anchor="team.dialog.invite.header" className="flex items-center justify-between pb-2">
                <h4 data-anchor="team.dialog.invite.title" className="font-display text-xs font-semibold">
                  Invite a teammate
                </h4>
                <button
                  type="button"
                  aria-label="Close the invite dialog"
                  onClick={() => setDialogOpen(false)}
                  className="grid size-5 place-items-center rounded text-fd-muted-foreground hover:bg-fd-secondary hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
              <div data-anchor="team.dialog.invite.email" className="flex flex-col gap-1">
                <p className="text-[11px] font-medium">Email</p>
                <div className="rounded border border-fd-border bg-fd-background px-2 py-1.5 text-[11px] text-fd-muted-foreground">
                  teammate@example.com
                </div>
              </div>
              <div data-anchor="team.dialog.invite.actions" className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  data-anchor="team.dialog.invite.send"
                  className="rounded bg-[#0f766e] px-2.5 py-1 text-[11px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Send invite
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <CursorLayer<DialogContext, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => cursor.user?.color ?? "#4f46e5"}
      />
      {children}
    </LiveCursorProvider>
  );
}

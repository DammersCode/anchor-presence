"use client";

import { createPresenceClient } from "@anchor-presence/core";
import { createBroadcastChannelTransport, type VisibilityPolicy } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider, useLocalContext } from "@anchor-presence/react";
import { useEffect, useRef, useState } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };
type DialogContext = { dialog?: "invite" };

const INVITE_DIALOG = "team.dialog.invite";

function PublishDialogContext({ open }: { open: boolean }) {
  const [, setContext] = useLocalContext<DialogContext>();
  useEffect(() => {
    setContext(open ? { dialog: "invite" } : {});
  }, [open, setContext]);
  return null;
}

export function InviteBoard() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const policy: VisibilityPolicy<DialogContext> = ({ presence, resolution }) => {
    if (resolution.tier === "hidden") return "hide";
    if (presence.context?.dialog === "invite" && !openRef.current) return "hide";
    if (openRef.current && !resolution.anchorId?.startsWith(INVITE_DIALOG)) return "hide";
    return "show";
  };

  return (
    <LiveCursorProvider<DialogContext, User>
      factory={() =>
        createPresenceClient<DialogContext, User>({
          transport: createBroadcastChannelTransport("invite-board"),
          user: { name: "Ada", color: "#0f766e" },
        })
      }
      bindingOptions={{ resolution: { visibilityPolicy: policy } }}
    >
      <PublishDialogContext open={open} />
      <div data-anchor="team" style={{ position: "relative", padding: 16 }}>
        <button type="button" data-anchor="team.action.invite" onClick={() => setOpen(true)}>
          Invite
        </button>
        <div data-anchor="team.card:ada">Ada</div>
        <div data-anchor="team.card:grace">Grace</div>
        {open ? (
          <div
            data-anchor={INVITE_DIALOG}
            role="dialog"
            aria-label="Invite a teammate"
            style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgb(255 255 255 / 0.7)" }}
          >
            <p data-anchor={`${INVITE_DIALOG}.title`}>Invite a teammate</p>
            <button type="button" data-anchor={`${INVITE_DIALOG}.close`} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        ) : null}
      </div>
      <CursorLayer<DialogContext, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
    </LiveCursorProvider>
  );
}

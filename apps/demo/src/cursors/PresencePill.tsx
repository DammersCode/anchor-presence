import { useCursorPresence, useCursorStatus } from "@anchor-presence/react";
import type { ConnectionStatus } from "@anchor-presence/core";
import { Avatar } from "../components/ui/avatar";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "./setup";
import type { DemoContext, DemoUser } from "./setup";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connecting: "bg-amber-400",
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-400",
  disconnected: "bg-red-500",
};

export function PresencePill() {
  const status = useCursorStatus();
  const presence = useCursorPresence<DemoContext, DemoUser>();

  return (
    <div data-anchor="topbar.presence" className="flex items-center gap-3 text-sm text-gray-500">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
        <span>{STATUS_LABEL[status]}</span>
      </div>

      <div className="flex items-center -space-x-2">
        {presence.map((p) => {
          const name = p.user?.name ?? p.clientId.slice(0, 6);
          const color = isKnownCursorColor(p.user?.color) ? p.user!.color : DEFAULT_CURSOR_COLOR;
          const inSettings = p.context?.dialog === "settings";
          return (
            <div key={p.clientId} className="relative">
              <Avatar name={name} style={{ backgroundColor: color }} className="bg-transparent" />
              {inSettings && (
                <span
                  className="absolute -bottom-1 -right-1 rounded-full bg-gray-900 px-1 text-[9px] font-medium leading-tight text-white ring-1 ring-white"
                  title={`${name} is in Settings`}
                >
                  in Settings
                </span>
              )}
            </div>
          );
        })}
      </div>

      <span data-anchor="topbar.presence.count" className="text-gray-400">
        {presence.length} online
      </span>
    </div>
  );
}

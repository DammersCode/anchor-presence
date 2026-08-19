import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import {
  LiveCursorContext,
  type LiveCursorContextValue,
  useCursorPresence,
  useCursorStatus,
} from "@anchor-presence/react";
import type { ConnectionStatus } from "@anchor-presence/core";
import { Avatar } from "../components/ui/avatar";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "./setup";
import type { DemoContext, DemoUser } from "./setup";

const EMPTY_CLIPPED_CLIENT_IDS: ReadonlySet<string> = new Set();

function membershipIsUnchanged(
  cursors: ReturnType<NonNullable<LiveCursorContextValue<DemoContext, DemoUser>["binding"]>["getSnapshot"]>,
  previous: ReadonlySet<string>,
): boolean {
  let size = 0;
  for (const cursor of cursors) {
    if (cursor.tier !== "anchor" || cursor.pointVisible) continue;
    size += 1;
    if (!previous.has(cursor.clientId)) return false;
  }
  return size === previous.size;
}

function selectClippedClientIds(
  binding: LiveCursorContextValue<DemoContext, DemoUser>["binding"],
  previous: ReadonlySet<string>,
): ReadonlySet<string> {
  const cursors = binding?.getSnapshot() ?? [];
  if (membershipIsUnchanged(cursors, previous)) return previous;
  const next = new Set<string>();
  for (const cursor of cursors) {
    if (cursor.tier === "anchor" && !cursor.pointVisible) next.add(cursor.clientId);
  }
  return next.size === 0 ? EMPTY_CLIPPED_CLIENT_IDS : next;
}

const getEmptyClippedClientIds = (): ReadonlySet<string> => EMPTY_CLIPPED_CLIENT_IDS;

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
  const { binding } = useContext(LiveCursorContext) as LiveCursorContextValue<DemoContext, DemoUser>;
  const clippedClientIdsRef = useRef<ReadonlySet<string>>(EMPTY_CLIPPED_CLIENT_IDS);
  const subscribe = useCallback(
    (listener: () => void) => binding?.subscribe(listener) ?? (() => {}),
    [binding],
  );
  const getClippedClientIds = useCallback(() => {
    const next = selectClippedClientIds(binding, clippedClientIdsRef.current);
    clippedClientIdsRef.current = next;
    return next;
  }, [binding]);
  const clippedClientIds = useSyncExternalStore(subscribe, getClippedClientIds, getEmptyClippedClientIds);

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
          const outOfView = clippedClientIds.has(p.clientId);
          return (
            <div key={p.clientId} className="relative">
              <Avatar name={name} style={{ backgroundColor: color }} className="bg-transparent" />
              {inSettings && (
                <span
                  data-testid="presence-in-settings"
                  data-cursor-name={name}
                  className="absolute -bottom-1 -right-1 rounded-full bg-gray-900 px-1 text-[9px] font-medium leading-tight text-white ring-1 ring-white"
                  title={`${name} is in Settings`}
                >
                  in Settings
                </span>
              )}
              {outOfView && (
                <span
                  data-testid="presence-out-of-view"
                  data-cursor-name={name}
                  className="absolute -bottom-1 -right-1 rounded-full bg-gray-900 px-1 text-[9px] font-medium leading-tight text-white ring-1 ring-white"
                >
                  out of view
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        {presence.map((p) => {
          const name = p.user?.name ?? p.clientId.slice(0, 6);
          const page = p.context?.page;
          if (!page) return null;
          return (
            <span key={p.clientId} data-testid="presence-page" className="text-xs text-gray-400">
              {name} · {page}
            </span>
          );
        })}
      </div>

      <span data-anchor="topbar.presence.count" className="text-gray-400">
        {presence.length} online
      </span>
    </div>
  );
}

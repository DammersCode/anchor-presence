import { useCursorAnchor } from "@anchor-presence/react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { PresencePill } from "../../cursors/PresencePill";

export interface TopbarProps {
  userName: string;
  room: string;
  onOpenSettings: () => void;
  onOpenMobileNav: () => void;
}

export function Topbar({ userName, room, onOpenSettings, onOpenMobileNav }: TopbarProps) {
  const topbarAnchor = useCursorAnchor("topbar");
  const searchAnchor = useCursorAnchor("topbar.search");
  const roomAnchor = useCursorAnchor("topbar.room");
  const userAnchor = useCursorAnchor("topbar.user");
  const settingsAnchor = useCursorAnchor("topbar.settings");

  return (
    <header ref={topbarAnchor} className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
        className="shrink-0 md:hidden"
      >
        ☰
      </Button>

      <div ref={searchAnchor} className="min-w-16 max-w-sm flex-1">
        <Input placeholder="Search orders, customers, products…" aria-label="Search" />
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <PresencePill />

        <div ref={roomAnchor} className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
          <span className="text-gray-400">Room</span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{room}</span>
        </div>

        <div ref={userAnchor} className="hidden text-sm text-gray-500 md:block">
          You are <span className="font-medium text-gray-700">{userName}</span>
        </div>

        <Button
          ref={settingsAnchor}
          data-testid="anchor-topbar.settings"
          variant="secondary"
          size="sm"
          onClick={onOpenSettings}
        >
          Settings
        </Button>
      </div>
    </header>
  );
}

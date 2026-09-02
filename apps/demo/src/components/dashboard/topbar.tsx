import { Avatar } from "../ui/avatar";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { PresencePill } from "../../cursors/PresencePill";

const PEERS = ["Sage", "Rowan", "Quinn"];
const PEER_COLORS = ["bg-emerald-500", "bg-amber-500", "bg-sky-500"];

export interface TopbarProps {
  userName: string;
  room: string;
  onOpenSettings: () => void;
}

export function Topbar({ userName, room, onOpenSettings }: TopbarProps) {
  return (
    <header data-anchor="topbar" className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4">
      <div data-anchor="topbar.search" className="max-w-sm flex-1">
        <Input placeholder="Search orders, customers, products…" aria-label="Search" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <PresencePill />

        <div data-anchor="topbar.room" className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-gray-400">Room</span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{room}</span>
        </div>

        <div data-anchor="topbar.user" className="text-sm text-gray-500">
          You are <span className="font-medium text-gray-700">{userName}</span>
        </div>

        <div data-anchor="topbar.avatars" className="flex items-center -space-x-2">
          {PEERS.map((peer, i) => (
            <Avatar key={peer} name={peer} colorClass={PEER_COLORS[i % PEER_COLORS.length]} />
          ))}
        </div>

        <Button
          data-anchor="topbar.settings"
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

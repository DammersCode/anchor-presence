import { useRemoteUsers } from "@anchor-presence/react";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "../cursors/setup";
import type { DemoUser } from "../cursors/setup";

export function WhoIsOnline() {
  const users = useRemoteUsers<DemoUser>();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
      <span className="text-xs font-medium text-gray-600">{users.length} online</span>
      <div className="flex items-center -space-x-1.5">
        {users.map((u) => (
          <span
            key={u.clientId}
            title={u.user?.name ?? u.clientId.slice(0, 6)}
            className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
            style={{
              backgroundColor: isKnownCursorColor(u.user?.color) ? u.user!.color : DEFAULT_CURSOR_COLOR,
            }}
          />
        ))}
      </div>
    </div>
  );
}

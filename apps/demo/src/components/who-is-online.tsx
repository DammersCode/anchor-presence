import { useRemoteUsers } from "../cursors/hooks";
import { DEFAULT_CURSOR_COLOR, isKnownCursorColor } from "../cursors/setup";

export function WhoIsOnline() {
  const users = useRemoteUsers();
  return (
    <aside
      aria-label="Who is online"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm"
    >
      <span role="status" className="text-xs font-medium text-gray-600">
        {users.length} online
      </span>
      <div className="flex items-center -space-x-1.5">
        {users.map((u) => (
          <span
            key={u.clientId}
            role="img"
            aria-label={u.user?.name ?? u.clientId.slice(0, 6)}
            title={u.user?.name ?? u.clientId.slice(0, 6)}
            className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
            style={{
              backgroundColor: isKnownCursorColor(u.user?.color) ? u.user!.color : DEFAULT_CURSOR_COLOR,
            }}
          />
        ))}
      </div>
    </aside>
  );
}

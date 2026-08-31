import { useCursorAnchor } from "@anchor-presence/react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { activity, type ActivityItem } from "../../data/activity";

function ActivityRow({ item }: { item: ActivityItem }) {
  const itemAnchor = useCursorAnchor(`activity.item:${item.id}`);
  return (
    <div ref={itemAnchor} className="flex items-start justify-between gap-2 text-sm">
      <span className="text-gray-700">
        <span className="font-medium text-gray-900">{item.actor}</span> {item.action}
      </span>
      <span className="shrink-0 text-xs text-gray-500">{item.time}</span>
    </div>
  );
}

export function RecentActivity() {
  const activityAnchor = useCursorAnchor("activity");
  return (
    <Card ref={activityAnchor}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        {activity.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

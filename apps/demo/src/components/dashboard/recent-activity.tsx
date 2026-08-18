import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { activity } from "../../data/activity";

export function RecentActivity() {
  return (
    <Card data-anchor="activity">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {activity.map((item) => (
          <div key={item.id} data-anchor={`activity.item:${item.id}`} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-gray-700">
              <span className="font-medium text-gray-900">{item.actor}</span> {item.action}
            </span>
            <span className="shrink-0 text-xs text-gray-400">{item.time}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

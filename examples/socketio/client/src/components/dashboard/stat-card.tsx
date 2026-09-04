import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/cn";

export interface StatCardProps {
  anchorId: string;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
}

export function StatCard({ anchorId, label, value, delta, trend }: StatCardProps) {
  return (
    <Card data-anchor={`stats.${anchorId}`} data-testid={`anchor-stats.${anchorId}`}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline justify-between gap-2 p-4">
        <span
          data-anchor={`stats.${anchorId}.value`}
          className="text-[1.4rem] font-semibold tabular-nums text-gray-900 sm:text-2xl lg:text-3xl"
        >
          {value}
        </span>
        <span
          data-anchor={`stats.${anchorId}.delta`}
          className={cn(
            "text-sm font-medium tabular-nums",
            trend === "up" ? "text-emerald-700" : "text-red-700",
          )}
        >
          {trend === "up" ? "▲" : "▼"} {delta}
        </span>
      </CardContent>
    </Card>
  );
}

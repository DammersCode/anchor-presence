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
      <CardContent className="flex items-baseline justify-between">
        <span data-anchor={`stats.${anchorId}.value`} className="text-2xl font-semibold text-gray-900">
          {value}
        </span>
        <span
          data-anchor={`stats.${anchorId}.delta`}
          className={cn("text-sm font-medium", trend === "up" ? "text-emerald-600" : "text-red-600")}
        >
          {trend === "up" ? "▲" : "▼"} {delta}
        </span>
      </CardContent>
    </Card>
  );
}

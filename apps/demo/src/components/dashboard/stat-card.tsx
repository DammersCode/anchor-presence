import { useCursorAnchor } from "@anchor-presence/react";
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
  const cardAnchor = useCursorAnchor(`stats.${anchorId}`);
  const valueAnchor = useCursorAnchor(`stats.${anchorId}.value`);
  const deltaAnchor = useCursorAnchor(`stats.${anchorId}.delta`);

  return (
    <Card ref={cardAnchor}>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline justify-between">
        <span ref={valueAnchor} className="text-2xl font-semibold text-gray-900">
          {value}
        </span>
        <span
          ref={deltaAnchor}
          className={cn("text-sm font-medium", trend === "up" ? "text-emerald-600" : "text-red-600")}
        >
          {trend === "up" ? "▲" : "▼"} {delta}
        </span>
      </CardContent>
    </Card>
  );
}

import { StatCard } from "./stat-card";

const STATS = [
  { anchorId: "revenue", label: "Revenue", value: "$48,231", delta: "12.4%", trend: "up" as const },
  { anchorId: "orders", label: "Orders", value: "1,284", delta: "3.1%", trend: "up" as const },
  { anchorId: "customers", label: "Customers", value: "892", delta: "1.8%", trend: "down" as const },
  { anchorId: "conversion", label: "Conversion", value: "4.6%", delta: "0.4%", trend: "up" as const },
];

export function StatsGrid() {
  return (
    <div data-anchor="stats" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {STATS.map((stat) => (
        <StatCard key={stat.anchorId} {...stat} />
      ))}
    </div>
  );
}

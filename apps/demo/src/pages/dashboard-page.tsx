import { StatsGrid } from "../components/dashboard/stats-grid";
import { OrdersTable } from "../components/dashboard/orders-table";
import { RecentActivity } from "../components/dashboard/recent-activity";

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <StatsGrid />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <OrdersTable
            onView={(id) => console.log("view", id)}
            onDelete={(id) => console.log("delete", id)}
          />
        </div>
        <RecentActivity />
      </div>
    </div>
  );
}

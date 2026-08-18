import { useState } from "react";
import { Sidebar } from "./components/dashboard/sidebar";
import { Topbar } from "./components/dashboard/topbar";
import { StatsGrid } from "./components/dashboard/stats-grid";
import { OrdersTable } from "./components/dashboard/orders-table";
import { RecentActivity } from "./components/dashboard/recent-activity";
import { SettingsDialog } from "./components/dashboard/settings-dialog";
import { randomName } from "./lib/names";

const params = new URLSearchParams(window.location.search);
const userName = params.get("name") || randomName();
const room = params.get("room") || "main";

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        activeItem={activeItem}
        onSelect={setActiveItem}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={userName} room={room} onOpenSettings={() => setSettingsOpen(true)} />

        <main data-anchor="main" className="flex-1 overflow-y-auto p-6">
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
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

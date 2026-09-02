import { useEffect, useState } from "react";
import { useCursorContext } from "@anchor-presence/react";
import { Sidebar } from "./components/dashboard/sidebar";
import { Topbar } from "./components/dashboard/topbar";
import { SettingsDialog } from "./components/dashboard/settings-dialog";
import { CursorLayer } from "./cursors/CursorLayer";
import { WhoIsOnline } from "./components/who-is-online";
import { localRoom, localUserName } from "./cursors/setup";
import type { LocalViewState } from "./cursors/visibilityPolicy";
import type { DemoContext } from "./cursors/setup";
import { usePageRoute, isPageId } from "./usePageRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ProductsPage } from "./pages/ProductsPage";
import type { InterpolatorStyle } from "./cursors/interpolators";

export interface AppProps {
  localViewState: LocalViewState;
  interpolatorStyle: InterpolatorStyle;
  onInterpolatorStyleChange: (style: InterpolatorStyle) => void;
}

export default function App({ localViewState, interpolatorStyle, onInterpolatorStyleChange }: AppProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, navigate] = usePageRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, setContext] = useCursorContext<DemoContext>();

  // Single writer for both the published context and the local state the visibility policy reads.
  useEffect(() => {
    localViewState.page = page;
    localViewState.settingsOpen = settingsOpen;
    setContext(settingsOpen ? { page, dialog: "settings" } : { page });
  }, [localViewState, page, settingsOpen, setContext]);

  // Sidebar's onSelect is id: string (also used for "settings", which doesn't navigate); narrow before routing.
  const handleSelect = (id: string) => {
    if (isPageId(id)) navigate(id);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        activeItem={page}
        onSelect={handleSelect}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={localUserName} room={localRoom} onOpenSettings={() => setSettingsOpen(true)} />

        <main data-anchor="main" className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && <DashboardPage />}
          {page === "orders" && <OrdersPage />}
          {page === "customers" && <CustomersPage />}
          {page === "products" && <ProductsPage />}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        interpolatorStyle={interpolatorStyle}
        onInterpolatorStyleChange={onInterpolatorStyleChange}
      />
      <CursorLayer />
      <WhoIsOnline />
    </div>
  );
}

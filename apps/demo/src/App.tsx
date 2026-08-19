import { useEffect, useState } from "react";
import { useCursorAnchor, useCursorContext } from "@anchor-presence/react";
import { Sidebar } from "./components/dashboard/sidebar";
import { Topbar } from "./components/dashboard/topbar";
import { SettingsDialog } from "./components/dashboard/settings-dialog";
import { CursorLayer } from "./cursors/CursorLayer";
import { localRoom, localUserName } from "./cursors/setup";
import { setLocalPage } from "./cursors/visibilityPolicy";
import type { DemoContext } from "./cursors/setup";
import { usePageRoute, isPageId } from "./usePageRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ProductsPage } from "./pages/ProductsPage";
import type { InterpolatorStyle } from "./cursors/interpolators";

export interface AppProps {
  interpolatorStyle: InterpolatorStyle;
  onInterpolatorStyleChange: (style: InterpolatorStyle) => void;
}

export default function App({ interpolatorStyle, onInterpolatorStyleChange }: AppProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, navigate] = usePageRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mainAnchor = useCursorAnchor("main");
  const [, setContext] = useCursorContext<DemoContext>();

  // Single source of truth for presence context: page + dialog state combined, so neither overwrites the other.
  useEffect(() => {
    setLocalPage(page);
    setContext(settingsOpen ? { page, dialog: "settings" } : { page });
  }, [page, settingsOpen, setContext]);

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

        <main ref={mainAnchor} className="flex-1 overflow-y-auto p-6">
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
    </div>
  );
}

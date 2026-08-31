import { useCursorAnchor } from "@anchor-presence/react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "orders", label: "Orders", icon: "▤" },
  { id: "customers", label: "Customers", icon: "▥" },
  { id: "products", label: "Products", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeItem: string;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function NavButton({ item, isActive, collapsed, onClick }: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const anchorRef = useCursorAnchor(`nav.${item.id}`);
  return (
    <button
      ref={anchorRef}
      data-testid={`anchor-nav.${item.id}`}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        isActive ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100",
      )}
    >
      <span className="w-4 shrink-0 text-center">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  activeItem,
  onSelect,
  onOpenSettings,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const sidebarAnchor = useCursorAnchor("sidebar");
  const brandAnchor = useCursorAnchor("sidebar.brand");
  const toggleAnchor = useCursorAnchor("sidebar.toggle");
  const navAnchor = useCursorAnchor("sidebar.nav");

  return (
    <aside
      ref={sidebarAnchor}
      onClick={mobileOpen ? onCloseMobile : undefined}
      className={cn(
        "z-50 flex w-64 flex-col border-r border-gray-200 bg-white",
        // Mobile: off-canvas drawer, closed off-screen.
        "fixed inset-y-0 left-0 -translate-x-full transition-transform duration-300 ease-in-out",
        mobileOpen && "sidebar-overlay translate-x-0",
        // Desktop: static, width toggle.
        "md:static md:z-auto md:h-screen md:translate-x-0 md:transition-[width] md:duration-300",
        collapsed ? "md:w-16" : "md:w-60",
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && (
          <span ref={brandAnchor} className="truncate text-sm font-semibold text-gray-900">
            Anchor Admin
          </span>
        )}
        <Button
          ref={toggleAnchor}
          data-testid="anchor-sidebar.toggle"
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          onClick={onToggle}
          className="ml-auto hidden shrink-0 md:inline-flex"
        >
          {collapsed ? "»" : "«"}
        </Button>
      </div>

      <nav ref={navAnchor} className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const handleClick = item.id === "settings" ? onOpenSettings : () => onSelect(item.id);
          return (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              collapsed={collapsed}
              onClick={handleClick}
            />
          );
        })}
      </nav>
    </aside>
  );
}

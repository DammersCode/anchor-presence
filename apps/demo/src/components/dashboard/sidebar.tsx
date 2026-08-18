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

export function Sidebar({ collapsed, onToggle, activeItem, onSelect, onOpenSettings }: SidebarProps) {
  const sidebarAnchor = useCursorAnchor("sidebar");
  const brandAnchor = useCursorAnchor("sidebar.brand");
  const toggleAnchor = useCursorAnchor("sidebar.toggle");
  const navAnchor = useCursorAnchor("sidebar.nav");

  return (
    <aside
      ref={sidebarAnchor}
      className={cn(
        "flex h-screen flex-col border-r border-gray-200 bg-white transition-[width] duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60",
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
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          onClick={onToggle}
          className="ml-auto shrink-0"
        >
          {collapsed ? "»" : "«"}
        </Button>
      </div>

      <nav ref={navAnchor} className="flex flex-1 flex-col gap-1 px-2">
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

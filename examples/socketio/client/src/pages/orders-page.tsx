import { OrdersTable } from "../components/dashboard/orders-table";

export function OrdersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div data-anchor="orders.pageHeader" data-testid="anchor-orders.pageHeader">
        <h1 className="text-lg font-semibold text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500">All orders placed across the storefront.</p>
      </div>

      <OrdersTable
        onView={(id) => console.log("view", id)}
        onDelete={(id) => console.log("delete", id)}
      />
    </div>
  );
}

import { Card, CardContent } from "../components/ui/card";
import { Avatar } from "../components/ui/avatar";
import { customers } from "../data/customers";

// Deliberately no anchor attribute on this page's content — demonstrates the un-anchored fallback.
export function CustomersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500">
          Everyone who has ever placed an order.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This page has no cursor anchors. Remote cursors here fall back to
        normalized viewport coordinates instead of tracking a specific element.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((customer) => (
          <Card key={customer.email}>
            <CardContent className="flex items-center gap-3 p-4">
              <Avatar name={customer.name} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-gray-900">
                  {customer.name}
                </span>
                <span className="truncate text-xs text-gray-500">
                  {customer.email}
                </span>
                <span className="text-xs text-gray-500">
                  {customer.orders} orders · {customer.spent}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

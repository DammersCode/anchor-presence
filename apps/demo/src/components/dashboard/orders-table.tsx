import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { orders, type Order, type OrderStatus } from "../../data/orders";

const STATUS_VARIANT: Record<OrderStatus, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  failed: "danger",
};

export interface OrdersTableProps {
  onView: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

function OrderRow({
  order,
  index,
  onView,
  onDelete,
}: {
  order: Order;
  index: number;
  onView: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}) {
  return (
    <TableRow data-anchor={`orders.row:${index}`} data-testid={`anchor-orders.row:${index}`}>
      <TableCell data-anchor={`orders.row:${index}.id`} className="font-medium text-gray-900">
        {order.id}
      </TableCell>
      <TableCell data-anchor={`orders.row:${index}.customer`}>
        <div className="flex flex-col">
          <span className="text-gray-900">{order.customer}</span>
          <span className="text-xs text-gray-500">{order.email}</span>
        </div>
      </TableCell>
      <TableCell data-anchor={`orders.row:${index}.date`}>{order.date}</TableCell>
      <TableCell data-anchor={`orders.row:${index}.status`}>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
      </TableCell>
      <TableCell data-anchor={`orders.row:${index}.amount`} className="text-right tabular-nums">
        ${order.amount.toFixed(2)}
      </TableCell>
      <TableCell data-anchor={`orders.row:${index}.actions`} className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            data-anchor={`orders.row:${index}.actions.view`}
            variant="outline"
            size="sm"
            onClick={() => onView(order.id)}
          >
            View
          </Button>
          <Button
            data-anchor={`orders.row:${index}.actions.delete`}
            variant="destructive"
            size="sm"
            onClick={() => onDelete(order.id)}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function OrdersTable({ onView, onDelete }: OrdersTableProps) {
  return (
    <Card data-anchor="orders">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900">Orders</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table data-anchor="orders.table">
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <OrderRow key={order.id} order={order} index={index} onView={onView} onDelete={onDelete} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

import { useCursorAnchor } from "@anchor-presence/react";
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

// Anchors registered per row via hooks here — not inside the parent's map loop — so each row's
// useCursorAnchor call site stays stable across re-renders (spec §12 / requirement 4).
function OrderRow({ order, index, onView, onDelete }: {
  order: Order;
  index: number;
  onView: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}) {
  const rowAnchor = useCursorAnchor(`orders.row:${index}`);
  const idAnchor = useCursorAnchor(`orders.row:${index}.id`);
  const customerAnchor = useCursorAnchor(`orders.row:${index}.customer`);
  const dateAnchor = useCursorAnchor(`orders.row:${index}.date`);
  const statusAnchor = useCursorAnchor(`orders.row:${index}.status`);
  const amountAnchor = useCursorAnchor(`orders.row:${index}.amount`);
  const actionsAnchor = useCursorAnchor(`orders.row:${index}.actions`);
  const viewAnchor = useCursorAnchor(`orders.row:${index}.actions.view`);
  const deleteAnchor = useCursorAnchor(`orders.row:${index}.actions.delete`);

  return (
    <TableRow ref={rowAnchor} data-testid={`anchor-orders.row:${index}`}>
      <TableCell ref={idAnchor} className="font-medium text-gray-900">
        {order.id}
      </TableCell>
      <TableCell ref={customerAnchor}>
        <div className="flex flex-col">
          <span className="text-gray-900">{order.customer}</span>
          <span className="text-xs text-gray-400">{order.email}</span>
        </div>
      </TableCell>
      <TableCell ref={dateAnchor}>{order.date}</TableCell>
      <TableCell ref={statusAnchor}>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
      </TableCell>
      <TableCell ref={amountAnchor} className="text-right tabular-nums">
        ${order.amount.toFixed(2)}
      </TableCell>
      <TableCell ref={actionsAnchor} className="text-right">
        <div className="flex justify-end gap-2">
          <Button ref={viewAnchor} variant="outline" size="sm" onClick={() => onView(order.id)}>
            View
          </Button>
          <Button ref={deleteAnchor} variant="destructive" size="sm" onClick={() => onDelete(order.id)}>
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function OrdersTable({ onView, onDelete }: OrdersTableProps) {
  const ordersAnchor = useCursorAnchor("orders");
  const tableAnchor = useCursorAnchor("orders.table");

  return (
    <Card ref={ordersAnchor}>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-gray-900">Orders</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table ref={tableAnchor}>
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

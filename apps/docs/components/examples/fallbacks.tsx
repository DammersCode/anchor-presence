"use client";

import type { PresenceClient } from "@dammers/anchor-presence-core";
import type { TourContext } from "./_preview/tour";
import { CursorLayer, PresenceProvider } from "./_preview/hooks";
import { useState, type ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<TourContext, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

type Order = { id: number; customer: string; total: string };

const ORDERS: Order[] = [
  { id: 1041, customer: "A. Rivera", total: "$129.00" },
  { id: 1042, customer: "M. Chen", total: "$48.50" },
  { id: 1043, customer: "S. Okafor", total: "$310.20" },
  { id: 1044, customer: "L. Novak", total: "$22.00" },
  { id: 1045, customer: "P. Singh", total: "$87.90" },
  { id: 1046, customer: "J. Moreau", total: "$156.00" },
  { id: 1047, customer: "K. Tanaka", total: "$64.30" },
  { id: 1048, customer: "E. Larsen", total: "$199.99" },
];

// Anchor chain for a refund button: shop > orders > orders.row:<id> > orders.row:<id>.refund
function OrdersTable({ orders, withActions }: { orders: Order[]; withActions: boolean }) {
  return (
    <table data-anchor="orders" className="w-full border-separate border-spacing-0 text-xs">
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} data-anchor={`orders.row:${order.id}`}>
            <td className="h-7 border-b border-fd-border pr-2 font-mono text-[11px] text-fd-muted-foreground">
              #{order.id}
            </td>
            <td className="border-b border-fd-border pr-2 font-medium">{order.customer}</td>
            <td className="border-b border-fd-border pr-2 text-right font-mono tabular-nums">
              {order.total}
            </td>
            {withActions ? (
              <td className="w-px border-b border-fd-border text-right">
                <button
                  type="button"
                  data-anchor={`orders.row:${order.id}.refund`}
                  className="rounded-md border border-fd-border px-1.5 py-0.5 text-[10px] font-medium hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-fd-ring"
                >
                  Refund
                </button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FallbacksScene({ client, layout, children }: Props) {
  const wide = layout === "wide";
  const [showOrders, setShowOrders] = useState(true);

  return (
    <PresenceProvider client={client}>
      <div data-anchor="shop" className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">{wide ? "All orders" : "Recent orders"}</h3>
          {wide ? (
            <span className="text-[11px] text-fd-muted-foreground">{ORDERS.length} orders</span>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={showOrders}
              onClick={() => setShowOrders((value) => !value)}
              className="flex items-center gap-1.5 rounded-full text-[11px] text-fd-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            >
              Show orders
              <span
                className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${showOrders ? "bg-indigo-600" : "bg-fd-border"}`}
              >
                <span
                  className={`size-3 rounded-full bg-white shadow transition-transform ${showOrders ? "translate-x-3" : ""}`}
                />
              </span>
            </button>
          )}
        </div>
        {showOrders ? (
          <>
            <OrdersTable orders={wide ? ORDERS : ORDERS.slice(0, 4)} withActions={wide} />
            {wide ? null : (
              <p className="text-[11px] text-fd-muted-foreground">
                4 of 8 orders. Refunds need the full list.
              </p>
            )}
          </>
        ) : (
          <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-fd-border text-[11px] text-fd-muted-foreground">
            Orders hidden
          </p>
        )}
      </div>
      <CursorLayer
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </PresenceProvider>
  );
}

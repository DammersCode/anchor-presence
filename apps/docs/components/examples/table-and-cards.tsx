"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { TourContext } from "./_preview/tour";
import { CursorLayer, PresenceProvider } from "./_preview/hooks";
import type { ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<TourContext, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

type Status = "paid" | "due" | "overdue" | "draft";

type Invoice = { id: string; customer: string; status: Status; amount: string; action: string };

const INVOICES: Invoice[] = [
  { id: "INV-2041", customer: "Northwind", status: "paid", amount: "$4,200.00", action: "Receipt" },
  { id: "INV-2042", customer: "Globex", status: "due", amount: "$1,180.00", action: "Remind" },
  { id: "INV-2043", customer: "Initech", status: "overdue", amount: "$960.00", action: "Remind" },
  { id: "INV-2044", customer: "Umbrella", status: "draft", amount: "$2,750.00", action: "Send" },
];

const STATUS_CLASS: Record<Status, string> = {
  paid: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  due: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  overdue: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  draft: "bg-fd-secondary text-fd-muted-foreground",
};

// Every field gets the same anchor ID in the table cell and in the card, so a cursor on a cell lands on that field.
const field = (invoice: Invoice, name: keyof Invoice) => `invoices.row:${invoice.id}.${name}`;

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  );
}

function ActionButton({ invoice }: { invoice: Invoice }) {
  return (
    <button
      type="button"
      data-anchor={field(invoice, "action")}
      className="rounded-md border border-fd-border px-2 py-1 text-[11px] font-medium hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-fd-ring"
    >
      {invoice.action}
    </button>
  );
}

function InvoiceTable() {
  return (
    <table className="w-full border-separate border-spacing-0 text-xs">
      <thead>
        <tr className="text-left text-[10px] tracking-wide text-fd-muted-foreground uppercase">
          <th className="border-b border-fd-border px-3 py-2 font-medium">Customer</th>
          <th className="border-b border-fd-border px-3 py-2 font-medium">Status</th>
          <th className="border-b border-fd-border px-3 py-2 text-right font-medium">Amount</th>
          <th className="border-b border-fd-border px-3 py-2">
            <span className="sr-only">Action</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {INVOICES.map((invoice) => (
          <tr key={invoice.id} data-anchor={`invoices.row:${invoice.id}`}>
            <td data-anchor={field(invoice, "customer")} className="border-b border-fd-border px-3 py-2.5">
              <span className="block font-medium">{invoice.customer}</span>
              <span className="font-mono text-[10px] text-fd-muted-foreground">{invoice.id}</span>
            </td>
            <td data-anchor={field(invoice, "status")} className="border-b border-fd-border px-3 py-2.5">
              <StatusPill status={invoice.status} />
            </td>
            <td
              data-anchor={field(invoice, "amount")}
              className="border-b border-fd-border px-3 py-2.5 text-right font-mono tabular-nums"
            >
              {invoice.amount}
            </td>
            <td className="border-b border-fd-border px-3 py-2.5 text-right">
              <ActionButton invoice={invoice} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceCards() {
  return (
    <ul className="flex flex-col gap-1.5">
      {INVOICES.map((invoice) => (
        <li
          key={invoice.id}
          data-anchor={`invoices.row:${invoice.id}`}
          className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-fd-border bg-fd-background px-2.5 py-1.5 text-xs"
        >
          <span
            data-anchor={field(invoice, "customer")}
            className="min-w-0 justify-self-start truncate font-medium"
          >
            {invoice.customer}
          </span>
          <span data-anchor={field(invoice, "status")} className="justify-self-end">
            <StatusPill status={invoice.status} />
          </span>
          <span data-anchor={field(invoice, "amount")} className="justify-self-start font-mono tabular-nums">
            {invoice.amount}
          </span>
          <span className="justify-self-end">
            <ActionButton invoice={invoice} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TableAndCardsScene({ client, layout, children }: Props) {
  return (
    <PresenceProvider client={client}>
      <div data-anchor="invoices" className="h-full p-2.5">
        {layout === "wide" ? <InvoiceTable /> : <InvoiceCards />}
      </div>
      <CursorLayer
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </PresenceProvider>
  );
}

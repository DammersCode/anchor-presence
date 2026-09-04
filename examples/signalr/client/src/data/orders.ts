export type OrderStatus = "paid" | "pending" | "refunded" | "failed";

export interface Order {
  id: string;
  customer: string;
  email: string;
  amount: number;
  status: OrderStatus;
  date: string;
}

const CUSTOMERS = [
  "Ava Martinez",
  "Liam Chen",
  "Noor Haddad",
  "Priya Nair",
  "Oscar Lindqvist",
  "Maya Fischer",
  "Diego Torres",
  "Yuki Tanaka",
  "Freya Solberg",
  "Amir Hassan",
  "Elena Popescu",
  "Jonas Weber",
  "Chidi Okafor",
  "Ines Costa",
  "Tobias Reiter",
];

const STATUSES: OrderStatus[] = ["paid", "pending", "refunded", "failed"];

export const orders: Order[] = CUSTOMERS.map((customer, i) => {
  const slug = customer.toLowerCase().replace(/\s+/g, ".");
  const day = String(28 - ((i * 2) % 27)).padStart(2, "0");
  return {
    id: `ORD-${String(1042 + i).padStart(4, "0")}`,
    customer,
    email: `${slug}@example.com`,
    amount: Math.round((45 + i * 37.3 + (i % 3) * 12.5) * 100) / 100,
    status: STATUSES[i % STATUSES.length]!,
    date: `2026-07-${day}`,
  };
});

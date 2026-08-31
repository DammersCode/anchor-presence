export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  time: string;
}

export const activity: ActivityItem[] = [
  { id: "a1", actor: "Ava Martinez", action: "placed order ORD-1042", time: "2m ago" },
  { id: "a2", actor: "Liam Chen", action: "requested a refund", time: "18m ago" },
  { id: "a3", actor: "System", action: "synced inventory feed", time: "42m ago" },
  { id: "a4", actor: "Noor Haddad", action: "updated shipping address", time: "1h ago" },
  { id: "a5", actor: "Priya Nair", action: "left a 5-star review", time: "3h ago" },
];

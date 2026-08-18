export interface Customer {
  name: string;
  email: string;
  orders: number;
  spent: string;
}

export const customers: Customer[] = [
  { name: "Ava Martinez", email: "ava.martinez@example.com", orders: 12, spent: "$1,204.50" },
  { name: "Liam Chen", email: "liam.chen@example.com", orders: 4, spent: "$312.00" },
  { name: "Noor Haddad", email: "noor.haddad@example.com", orders: 8, spent: "$895.20" },
  { name: "Priya Nair", email: "priya.nair@example.com", orders: 21, spent: "$2,410.75" },
  { name: "Oscar Lindqvist", email: "oscar.lindqvist@example.com", orders: 2, spent: "$98.40" },
  { name: "Maya Fischer", email: "maya.fischer@example.com", orders: 15, spent: "$1,650.10" },
  { name: "Diego Torres", email: "diego.torres@example.com", orders: 6, spent: "$540.00" },
  { name: "Yuki Tanaka", email: "yuki.tanaka@example.com", orders: 9, spent: "$1,022.30" },
  { name: "Freya Solberg", email: "freya.solberg@example.com", orders: 3, spent: "$205.60" },
  { name: "Amir Hassan", email: "amir.hassan@example.com", orders: 11, spent: "$1,180.90" },
];

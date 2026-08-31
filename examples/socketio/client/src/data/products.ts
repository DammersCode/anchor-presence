export interface Product {
  name: string;
  category: string;
  price: string;
  stock: number;
}

export const products: Product[] = [
  { name: "Aurora Desk Lamp", category: "Lighting", price: "$64.00", stock: 128 },
  { name: "Solstice Mug", category: "Kitchen", price: "$18.00", stock: 342 },
  { name: "Meridian Backpack", category: "Bags", price: "$96.00", stock: 54 },
  { name: "Cascade Water Bottle", category: "Outdoor", price: "$28.00", stock: 210 },
  { name: "Harbor Throw Blanket", category: "Home", price: "$52.00", stock: 76 },
  { name: "Ridgeline Trail Boots", category: "Footwear", price: "$140.00", stock: 39 },
  { name: "Nimbus Pillow", category: "Home", price: "$34.00", stock: 165 },
  { name: "Tidal Notebook Set", category: "Stationery", price: "$22.00", stock: 288 },
];

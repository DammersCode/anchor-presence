import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { products, type Product } from "../data/products";

function CardBody({ product }: { product: Product }) {
  return (
    <CardContent className="flex flex-col gap-1 p-4">
      <span className="text-sm font-medium text-gray-900">{product.name}</span>
      <span className="text-xs text-gray-400">{product.category}</span>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-900">{product.price}</span>
        <span className="text-xs text-gray-500">{product.stock} in stock</span>
      </div>
    </CardContent>
  );
}

// Registers a semantic anchor: remote cursors resolve to this exact card regardless of layout.
function AnchoredProductCard({ product, index }: { product: Product; index: number }) {
  return (
    <Card
      data-anchor={`products.card:${index}`}
      data-testid={`anchor-products.card:${index}`}
      className="relative"
    >
      <Badge variant="success" className="absolute right-3 top-3">
        anchored
      </Badge>
      <CardBody product={product} />
    </Card>
  );
}

// No anchor attribute: remote cursors over this card fall back to normalized viewport coordinates.
function PlainProductCard({ product }: { product: Product }) {
  return (
    <Card className="relative">
      <Badge variant="neutral" className="absolute right-3 top-3">
        not anchored
      </Badge>
      <CardBody product={product} />
    </Card>
  );
}

export function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Products</h1>
        <p className="text-sm text-gray-500">
          Half of these cards register a cursor anchor, half don't — compare how remote cursors resolve on
          each as you move between them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product, index) =>
          index % 2 === 0 ? (
            <AnchoredProductCard key={product.name} product={product} index={index} />
          ) : (
            <PlainProductCard key={product.name} product={product} />
          ),
        )}
      </div>
    </div>
  );
}

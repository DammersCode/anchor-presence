import type { UiProps } from "./variant";

const products = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Product ${i + 1}`,
  price: `$${19 + i * 7}`,
}));
const filters = ["Price", "Brand", "Rating", "Color"];

export function Shop({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <div
      data-anchor="shop"
      className={jumpy ? "flex flex-col gap-4 p-4 lg:flex-row" : "flex flex-wrap items-start gap-8 p-4"}
    >
      <aside
        data-anchor="shop.filters"
        className={`rounded-lg bg-white p-3 ${jumpy ? "hidden w-56 lg:block" : "flex w-[358px] flex-wrap gap-2"}`}
      >
        {filters.map((f) => (
          <label
            key={f}
            data-anchor={`shop.filter:${f}`}
            className={`rounded border px-2 py-1 text-sm ${jumpy ? "block" : "w-[84px] text-center"}`}
          >
            {f}
          </label>
        ))}
      </aside>
      <div
        data-anchor="shop.grid"
        className={
          jumpy
            ? "grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
            : "flex w-[358px] flex-wrap gap-3"
        }
      >
        {products.map((p) => (
          <article
            key={p.id}
            data-anchor={`shop.product:${p.id}`}
            className={`rounded-lg border bg-white p-2 ${jumpy ? "" : "w-[173px]"}`}
          >
            <div
              data-anchor={`shop.product:${p.id}.image`}
              className={`rounded bg-sky-200 ${jumpy ? "h-40" : "h-24"}`}
            />
            <p data-anchor={`shop.product:${p.id}.name`} className="mt-1 text-sm">
              {p.name}
            </p>
            <p data-anchor={`shop.product:${p.id}.price`} className="text-sm font-semibold">
              {p.price}
            </p>
            <button
              data-anchor={`shop.product:${p.id}.add`}
              type="button"
              className={`mt-1 rounded bg-indigo-600 py-1 text-xs text-white ${jumpy ? "w-full" : "w-16"}`}
            >
              Add
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

import type { UiProps } from "./variant";

const photos = Array.from({ length: 12 }, (_, i) => i + 1);
const hues = ["bg-rose-300", "bg-amber-300", "bg-emerald-300", "bg-sky-300", "bg-violet-300"];
const filters = ["All", "Nature", "City"];

export function Gallery({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <section data-anchor="gall" className="p-4">
      <nav data-anchor="gall.filters" className="mb-8 flex gap-2 text-sm">
        {filters.map((f) => (
          <button
            key={f}
            data-anchor={`gall.filter:${f}`}
            type="button"
            className="w-20 rounded border bg-white py-1"
          >
            {f}
          </button>
        ))}
      </nav>
      <div
        data-anchor="gall.grid"
        className={jumpy ? "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6" : "flex flex-wrap gap-8"}
      >
        {(jumpy ? [photos] : [photos.slice(0, 6), photos.slice(6)]).map((set, s) => (
          <div
            key={set[0]}
            data-anchor={jumpy ? undefined : `gall.set:${s}`}
            className={jumpy ? "contents" : "flex w-[358px] flex-wrap gap-3"}
          >
            {set.map((n) => (
              <figure
                key={n}
                data-anchor={`gall.photo:${n}`}
                className={`${hues[n % hues.length]} rounded-lg ${jumpy ? (n % 5 === 0 ? "col-span-2 aspect-video" : "aspect-square") : "size-[173px]"}`}
              >
                <figcaption data-anchor={`gall.caption:${n}`} className="p-2 text-xs">
                  Photo {n}
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

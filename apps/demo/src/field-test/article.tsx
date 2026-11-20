import type { UiProps } from "./variant";

const paragraphs = [
  "Cursors move across screens that differ in size. The same element may sit in a very different place.",
  "A pointer maps through named anchors, so the remote cursor lands on the element and not on a pixel.",
  "When layouts differ, the anchor box changes shape and the pointer drifts inside it.",
];
const related = ["Anchors", "Fallbacks", "Policies", "Transports"];
const tags = ["layout", "cursors", "design"];

export function Article({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  const panel = jumpy ? "" : "w-[358px]";
  return (
    <div
      data-anchor="arti"
      className={jumpy ? "flex flex-col gap-6 p-4 lg:flex-row" : "flex flex-wrap items-start gap-8 p-4"}
    >
      <article data-anchor="arti.body" className={`rounded-lg bg-white p-4 ${jumpy ? "flex-1" : panel}`}>
        <h1 data-anchor="arti.title" className="text-xl font-bold">
          Calm cursors across layouts
        </h1>
        <p data-anchor="arti.byline" className="text-xs text-gray-500">
          By Ada, 4 min read
        </p>
        {paragraphs.map((p, i) => (
          <p key={p} data-anchor={`arti.p:${i}`} className="mt-3 text-sm leading-6">
            {p}
          </p>
        ))}
        <div data-anchor="arti.tags" className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              data-anchor={`arti.tag:${t}`}
              className="w-20 rounded bg-gray-100 px-2 py-0.5 text-center text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      </article>
      <aside
        data-anchor="arti.side"
        className={`space-y-3 rounded-lg bg-white p-4 ${jumpy ? "w-full lg:w-64" : panel}`}
      >
        <h2 data-anchor="arti.side.title" className="text-sm font-semibold">
          Related
        </h2>
        <ul data-anchor="arti.related" className="space-y-1 text-sm">
          {related.map((r) => (
            <li key={r} data-anchor={`arti.related:${r}`} className={jumpy ? "" : "h-7"}>
              {r}
            </li>
          ))}
        </ul>
        <button
          data-anchor="arti.subscribe"
          type="button"
          className={`rounded bg-indigo-600 py-1.5 text-sm text-white ${jumpy ? "w-full" : "w-32"}`}
        >
          Subscribe
        </button>
      </aside>
    </div>
  );
}

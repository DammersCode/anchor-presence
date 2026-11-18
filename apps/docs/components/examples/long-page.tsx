import type { ReactNode } from "react";

const SECTIONS = [
  "Summary",
  "Goals",
  "Timeline",
  "Budget",
  "Risks",
  "Team",
  "Metrics",
  "Next steps",
] as const;

/** A planning doc: every section fits in the wide layout; the narrow layout is a long scroll page. */
export function LongPage({ layout, header }: { layout: "wide" | "narrow"; header?: ReactNode }) {
  if (layout === "wide") {
    return (
      <div className="grid h-full grid-cols-2 grid-rows-4 gap-1.5 p-2.5">
        {SECTIONS.map((title, index) => (
          <section
            key={title}
            data-anchor={`doc.section:${index + 1}`}
            className="flex min-h-0 flex-col justify-center rounded-lg border border-fd-border bg-fd-background px-2.5"
          >
            <p className="font-mono text-[10px] text-fd-muted-foreground">{index + 1}</p>
            <h3 className="truncate text-xs font-semibold">{title}</h3>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div data-page-scroller="" className="min-h-0 flex-1 overflow-y-auto px-2.5">
        {SECTIONS.map((title, index) => (
          <section
            key={title}
            data-anchor={`doc.section:${index + 1}`}
            className="my-2.5 h-[180px] rounded-lg border border-fd-border bg-fd-background p-3"
          >
            <p className="font-mono text-[10px] text-fd-muted-foreground">Section {index + 1}</p>
            <h3 className="font-display text-sm font-semibold">{title}</h3>
            <div aria-hidden="true" className="mt-3 space-y-2">
              <div className="h-2 w-11/12 rounded bg-fd-muted" />
              <div className="h-2 w-4/5 rounded bg-fd-muted" />
              <div className="h-2 w-2/3 rounded bg-fd-muted" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

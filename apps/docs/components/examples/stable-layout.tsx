"use client";

import type { PresenceClient } from "@anchor-presence/core";
import { CursorLayer, PresenceProvider } from "@anchor-presence/react";
import type { ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const STEPS = [
  { id: "build", label: "Build" },
  { id: "test", label: "Test" },
  { id: "docs", label: "Docs" },
  { id: "review", label: "Review" },
  { id: "tag", label: "Tag" },
  { id: "ship", label: "Ship" },
];

const button =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring";

// The card keeps one width and three tiles per line in both panes. The wide pane adds a side panel instead of reflowing the card.
export function StableLayoutScene({ client, layout, children }: Props) {
  return (
    <PresenceProvider client={client}>
      <div data-anchor="release.page" className="flex h-full items-center justify-center gap-3 p-4">
        <section
          data-anchor="release"
          className="w-full max-w-[17.75rem] flex-none rounded-xl border border-fd-border bg-fd-background p-4 shadow-sm"
        >
          <p
            data-anchor="release.tag"
            className="font-mono text-[10px] tracking-wider text-fd-muted-foreground uppercase"
          >
            Checklist
          </p>
          <h3 data-anchor="release.title" className="font-display mt-1 text-base font-semibold">
            Release 2.4
          </h3>
          <div data-anchor="release.steps" className="mt-3 flex flex-wrap gap-2">
            {STEPS.map((step) => (
              <div
                key={step.id}
                data-anchor={`release.step:${step.id}`}
                className="grid h-10 w-20 place-items-center rounded-lg border border-fd-border bg-fd-secondary text-xs font-medium"
              >
                {step.label}
              </div>
            ))}
          </div>
          <div data-anchor="release.actions" className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" data-anchor="release.save" className={`${button} bg-fd-secondary`}>
              Save draft
            </button>
            <button
              type="button"
              data-anchor="release.publish"
              className={`${button} bg-gradient-brand text-white`}
            >
              Publish
            </button>
          </div>
        </section>
        {layout === "wide" ? (
          <aside
            data-anchor="release.activity"
            className="w-24 flex-none rounded-xl border border-fd-border bg-fd-background p-3 text-xs text-fd-muted-foreground"
          >
            Mira is on Docs
          </aside>
        ) : null}
      </div>
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </PresenceProvider>
  );
}

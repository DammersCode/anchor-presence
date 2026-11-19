"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { TourContext } from "./_preview/tour";
import { CursorLayer, PresenceProvider } from "./_preview/hooks";
import type { ReactNode } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<TourContext, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const button =
  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring";

export function BasicsScene({ client, layout, children }: Props) {
  const wide = layout === "wide";

  return (
    <PresenceProvider client={client}>
      <div className="grid h-full place-items-center p-4">
        <section
          data-anchor="post"
          className="w-full max-w-sm rounded-xl border border-fd-border bg-fd-background p-4 shadow-sm"
        >
          <p
            data-anchor="post.tag"
            className="font-mono text-[10px] tracking-wider text-fd-muted-foreground uppercase"
          >
            Draft
          </p>
          <h3 data-anchor="post.title" className="font-display mt-1 text-base font-semibold">
            Release notes 2.4
          </h3>
          <p data-anchor="post.summary" className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">
            Anchored cursors, faster sync, and a presence list.
          </p>
          <div className={`mt-4 flex gap-2 ${wide ? "justify-end" : "flex-col"}`}>
            <button type="button" data-anchor="post.save" className={`${button} bg-fd-secondary`}>
              Save draft
            </button>
            <button type="button" data-anchor="post.preview" className={`${button} border border-fd-border`}>
              Preview
            </button>
            <button
              type="button"
              data-anchor="post.publish"
              className={`${button} bg-gradient-brand text-white`}
            >
              Publish
            </button>
          </div>
        </section>
      </div>
      <CursorLayer
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </PresenceProvider>
  );
}

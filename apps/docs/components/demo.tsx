"use client";

import dynamic from "next/dynamic";

const DemoPanes = dynamic(() => import("./demo/demo-panes").then((mod) => mod.DemoPanes), {
  ssr: false,
  loading: () => (
    <div className="my-6 h-[420px] animate-pulse rounded-lg border border-fd-border bg-fd-secondary/40" />
  ),
});

/** MDX-facing live demo: two panes, two layouts, one shared presence channel. */
export function Demo() {
  return <DemoPanes />;
}

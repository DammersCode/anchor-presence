"use client";

import { useId, useMemo, useState } from "react";

/**
 * Two independent panes (wide vs narrow layout), each its own iframe, wired through a
 * shared BroadcastChannel. Moving the pointer in one pane shows a live cursor in the other,
 * on the same semantic anchor even though the layouts differ.
 */
export function DemoPanes() {
  const reactId = useId();
  const [channel] = useState(() => `anchor-presence-demo-${reactId}-${Math.random().toString(36).slice(2)}`);
  const wideSrc = useMemo(() => `/demo-frame/home/wide?channel=${encodeURIComponent(channel)}`, [channel]);
  const narrowSrc = useMemo(
    () => `/demo-frame/home/narrow?channel=${encodeURIComponent(channel)}`,
    [channel],
  );

  return (
    <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-[3fr_2fr]">
      <iframe
        title="Wide layout pane"
        src={wideSrc}
        className="h-72 w-full rounded-lg border border-fd-border"
        loading="lazy"
      />
      <iframe
        title="Narrow layout pane"
        src={narrowSrc}
        className="h-72 w-full rounded-lg border border-fd-border"
        loading="lazy"
      />
    </div>
  );
}

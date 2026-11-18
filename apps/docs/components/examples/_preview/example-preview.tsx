"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openControlChannel, readControlMessage } from "./control";
import { LAYOUTS, SCENES, type SceneName } from "./scenes";
import type { TourState } from "./tour";

const PANE_HEIGHT = "h-[340px]";

function statusText(state: TourState | "loading", guide: string): string {
  switch (state) {
    case "loading":
      return "Loading the preview.";
    case "playing":
    case "waiting":
      return `${guide} tours the wide pane. Move your pointer over a pane to take over.`;
    case "yielded":
      return "You have control. The tour continues after 4 seconds without input.";
    case "paused":
      return "Tour paused. Move your pointer over a pane to try it yourself.";
    default:
      return state satisfies never;
  }
}

function PaneSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${PANE_HEIGHT} flex items-center justify-center rounded-lg border border-fd-border bg-fd-muted text-xs text-fd-muted-foreground motion-safe:animate-pulse ${className}`}
    >
      Loading the preview
    </div>
  );
}

function PaneFrame({ title, src }: { title: string; src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      <iframe
        title={title}
        src={src}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`block ${PANE_HEIGHT} w-full rounded-lg border border-fd-border bg-fd-card`}
      />
      {loaded ? null : <PaneSkeleton className="absolute inset-0" />}
    </div>
  );
}

/** Two panes of one scene in two layouts, linked by a presence channel, with a guided tour. */
export function ExamplePreview({ scene }: { scene: SceneName }) {
  const meta = SCENES[scene];
  const guide = meta.tour[0]?.user.name ?? "A guide";
  const rootRef = useRef<HTMLElement>(null);
  const controlRef = useRef<BroadcastChannel | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [tour, setTour] = useState<TourState | "loading">("loading");

  useEffect(() => {
    const name = `anchor-presence-${scene}-${crypto.randomUUID()}`;
    const control = openControlChannel(name);
    controlRef.current = control;
    let visible = true;
    const sendVisibility = () => control.postMessage({ kind: "visible", visible });

    control.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = readControlMessage(event);
      if (message?.kind === "tour") setTour(message.state);
      if (message?.kind === "hello") sendVisibility();
    });

    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return;
      visible = entry.isIntersecting;
      sendVisibility();
    });
    if (rootRef.current !== null) observer.observe(rootRef.current);

    setChannel(name);
    return () => {
      observer.disconnect();
      control.close();
      controlRef.current = null;
    };
  }, [scene]);

  const paused = tour === "paused";
  const playing = tour === "playing" || tour === "waiting";

  return (
    <figure
      ref={rootRef}
      className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-sm"
    >
      <figcaption className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-fd-border px-3 py-2 text-xs">
        <span
          aria-hidden="true"
          className={`size-2 flex-none rounded-full ${playing ? "live-dot bg-[#22d3ee]" : "bg-fd-muted-foreground/40"}`}
        />
        <span aria-live="polite" className="min-w-0 flex-1 text-fd-muted-foreground">
          {statusText(tour, guide)}
        </span>
        <button
          type="button"
          disabled={tour === "loading"}
          onClick={() => controlRef.current?.postMessage({ kind: "toggle" })}
          className="inline-flex flex-none items-center gap-1.5 rounded-md border border-fd-border bg-fd-background px-2 py-1 font-medium text-fd-foreground transition-colors hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring disabled:opacity-50"
        >
          {paused ? (
            <Play className="size-3.5" aria-hidden="true" />
          ) : (
            <Pause className="size-3.5" aria-hidden="true" />
          )}
          {paused ? "Play tour" : "Pause tour"}
        </button>
      </figcaption>
      <div className="grid gap-3 bg-fd-background bg-[radial-gradient(var(--color-fd-border)_1px,transparent_1px)] bg-size-[14px_14px] p-3 sm:grid-cols-[1.5fr_1fr]">
        {LAYOUTS.map((layout) => {
          const caption = meta.panes[layout];
          return (
            <div key={layout} className="min-w-0">
              <p className="mb-1.5 flex items-baseline gap-2 text-[11px]">
                <span className="font-mono font-semibold tracking-wider text-fd-foreground uppercase">
                  {caption.label}
                </span>
                <span className="truncate text-fd-muted-foreground">{caption.detail}</span>
              </p>
              {channel === null ? (
                <PaneSkeleton />
              ) : (
                <PaneFrame
                  key={channel}
                  title={`${caption.label} layout: ${caption.detail}`}
                  src={`/demo-frame/${scene}/${layout}?channel=${encodeURIComponent(channel)}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

"use client";

import { useId, useLayoutEffect, useState } from "react";
import { useTheme } from "next-themes";

const BRAND_COLORS = {
  primary: "#4f46e5",
  secondary: "#22d3ee",
};

/** Reads the fd-* CSS custom properties so the diagram matches the active theme, light or dark. */
function readThemeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();

  return {
    background: read("--color-fd-card") || read("--color-fd-background"),
    primaryColor: read("--color-fd-accent"),
    primaryTextColor: read("--color-fd-accent-foreground"),
    primaryBorderColor: BRAND_COLORS.primary,
    secondaryColor: read("--color-fd-secondary"),
    secondaryTextColor: read("--color-fd-secondary-foreground"),
    secondaryBorderColor: BRAND_COLORS.secondary,
    tertiaryColor: read("--color-fd-muted"),
    tertiaryTextColor: read("--color-fd-muted-foreground"),
    tertiaryBorderColor: read("--color-fd-border"),
    lineColor: read("--color-fd-muted-foreground"),
    textColor: read("--color-fd-foreground"),
    mainBkg: read("--color-fd-card"),
    nodeBorder: BRAND_COLORS.primary,
    clusterBkg: read("--color-fd-muted"),
    clusterBorder: read("--color-fd-border"),
    actorBkg: read("--color-fd-card"),
    actorBorder: BRAND_COLORS.primary,
    actorTextColor: read("--color-fd-foreground"),
    actorLineColor: read("--color-fd-muted-foreground"),
    signalColor: read("--color-fd-foreground"),
    signalTextColor: read("--color-fd-foreground"),
    labelBoxBkgColor: read("--color-fd-card"),
    labelBoxBorderColor: BRAND_COLORS.primary,
    labelTextColor: read("--color-fd-foreground"),
    loopTextColor: read("--color-fd-foreground"),
    noteBkgColor: read("--color-fd-accent"),
    noteTextColor: read("--color-fd-accent-foreground"),
    noteBorderColor: BRAND_COLORS.secondary,
  };
}

/** Client-only Mermaid renderer: lazy-loads `mermaid`, themes it from site tokens, and re-renders on theme change. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "-");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;

    const render = async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        fontFamily: "var(--font-sans, ui-sans-serif)",
        themeVariables: readThemeVariables(),
        flowchart: { useMaxWidth: false, wrappingWidth: 260 },
        sequence: { useMaxWidth: false, mirrorActors: false },
        state: { useMaxWidth: false },
      });
      const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart);
      if (!cancelled) setSvg(rendered);
    };

    // A hidden tab measures text wrong, so Mermaid would lay the diagram out at a huge size.
    const renderWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", renderWhenVisible);
      void render();
    };
    document.addEventListener("visibilitychange", renderWhenVisible);
    renderWhenVisible();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", renderWhenVisible);
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div className="my-6 min-h-32 overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4">
      {svg ? (
        <div className="[&_svg]:mx-auto [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="h-32 animate-pulse rounded-md bg-fd-secondary/40" aria-hidden />
      )}
    </div>
  );
}

import { useCallback, useState } from "react";
import type { InterpolatorStyle } from "./cursors/interpolators";
import { INTERPOLATOR_STYLES } from "./cursors/interpolators";

const DEFAULT_STYLE: InterpolatorStyle = "spring";
const PARAM = "interp";

function isInterpolatorStyle(value: string | null): value is InterpolatorStyle {
  return INTERPOLATOR_STYLES.some((style) => style === value);
}

function readStyleFromUrl(): InterpolatorStyle {
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return isInterpolatorStyle(value) ? value : DEFAULT_STYLE;
}

/** ?interp= routing via history.pushState, mirrors usePageRoute.ts. No popstate listener: this value only remounts the cursor binding. */
export function useInterpolatorStyle(): [InterpolatorStyle, (style: InterpolatorStyle) => void] {
  const [style, setStyle] = useState<InterpolatorStyle>(() => readStyleFromUrl());

  const select = useCallback((next: InterpolatorStyle) => {
    setStyle((current) => {
      if (current === next) return current;
      const url = new URL(window.location.href);
      if (next === DEFAULT_STYLE) url.searchParams.delete(PARAM);
      else url.searchParams.set(PARAM, next);
      window.history.pushState({}, "", url);
      return next;
    });
  }, []);

  return [style, select];
}

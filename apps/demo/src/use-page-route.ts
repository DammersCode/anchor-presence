import { useCallback, useEffect, useState } from "react";
import type { PageId } from "./cursors/setup";

const PAGE_IDS: readonly PageId[] = ["dashboard", "orders", "customers", "products"];
const DEFAULT_PAGE: PageId = "dashboard";

export function isPageId(value: string | null): value is PageId {
  return PAGE_IDS.some((id) => id === value);
}

function readPageFromUrl(): PageId {
  const value = new URLSearchParams(window.location.search).get("page");
  return isPageId(value) ? value : DEFAULT_PAGE;
}

/** ?page= routing via history.pushState (no router dependency), mirrors the pre-existing ?page=bench convention. */
export function usePageRoute(): [PageId, (page: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => readPageFromUrl());

  useEffect(() => {
    const onPopState = () => setPage(readPageFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: PageId) => {
    setPage((current) => {
      if (current === next) return current;
      const url = new URL(window.location.href);
      if (next === DEFAULT_PAGE) url.searchParams.delete("page");
      else url.searchParams.set("page", next);
      window.history.pushState({}, "", url);
      return next;
    });
  }, []);

  return [page, navigate];
}

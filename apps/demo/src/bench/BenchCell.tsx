import { useCursorAnchor } from "@anchor-presence/react";

// One hook call site per grid cell (rows come from a real component, not a loop) — same rule as
// the dashboard's row/item components, kept consistent for the bench grid's anchors.
export function BenchCell({ anchorId }: { anchorId: string }) {
  const ref = useCursorAnchor(anchorId);
  return <div ref={ref} className="h-4 w-4 rounded-sm border border-gray-200 bg-white" />;
}

import { useCursorAnchor } from "@anchor-presence/react";

export function BenchCell({ anchorId }: { anchorId: string }) {
  const ref = useCursorAnchor(anchorId);
  return <div ref={ref} className="h-4 w-4 rounded-sm border border-gray-200 bg-white" />;
}

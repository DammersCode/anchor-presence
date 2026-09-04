export function BenchCell({ anchorId }: { anchorId: string }) {
  return <div data-anchor={anchorId} className="h-4 w-4 rounded-sm border border-gray-200 bg-white" />;
}

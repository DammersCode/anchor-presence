import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import type React from "react";
import { cn } from "../../lib/cn";

export function Table({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }) {
  return (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-gray-200", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-gray-100", className)} {...props} />;
}

export function TableRow({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }) {
  return <tr ref={ref} className={cn("hover:bg-gray-50", className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ref,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }) {
  return <td ref={ref} className={cn("px-4 py-2.5 text-gray-700", className)} {...props} />;
}

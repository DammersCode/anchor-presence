import type { HTMLAttributes } from "react";
import type React from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_0_rgba(16,24,40,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-medium text-gray-500", className)} {...props} />;
}

// Callers own the padding so header-less cards stay consistent (p-4) while
// full-bleed content (tables) can use p-0 without fighting a base value.
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}

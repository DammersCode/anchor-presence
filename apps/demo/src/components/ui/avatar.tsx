import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  colorClass?: string;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({ name, colorClass = "bg-indigo-600", className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white",
        colorClass,
        className,
      )}
      title={name}
      role="img"
      aria-label={name}
      {...props}
    >
      {initials(name)}
    </div>
  );
}

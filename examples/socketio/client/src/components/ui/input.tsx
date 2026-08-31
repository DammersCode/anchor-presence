import type { InputHTMLAttributes } from "react";
import type React from "react";
import { cn } from "../../lib/cn";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
        className,
      )}
      {...props}
    />
  );
}

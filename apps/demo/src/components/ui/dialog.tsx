import { useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import type React from "react";
import { cn } from "../../lib/cn";

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref !== null && ref !== undefined) (ref as React.RefObject<T | null>).current = value;
    }
  };
}

// A fixed overlay, not <dialog>: the top layer would beat the cursors' z-index.
export function Dialog({ open, onClose, children, className, ref: externalRef, ...props }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={mergeRefs(panelRef, externalRef)}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative m-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-0 shadow-lg outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-gray-100 p-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-gray-900", className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4 p-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2 border-t border-gray-100 p-4", className)} {...props} />;
}

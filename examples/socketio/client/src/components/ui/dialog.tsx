import { useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import type React from "react";
import { cn } from "../../lib/cn";

export interface DialogProps extends Omit<
  HTMLAttributes<HTMLDialogElement>,
  "onClick"
> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ref?: React.Ref<HTMLDialogElement>;
}

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref !== null && ref !== undefined)
        (ref as React.RefObject<T | null>).current = value;
    }
  };
}

export function Dialog({
  open,
  onClose,
  children,
  className,
  ref: externalRef,
  ...props
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={mergeRefs(ref, externalRef)}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-gray-900/40",
        "w-[min(28rem,calc(100vw-2rem))]",
        className,
      )}
      {...props}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </dialog>
  );
}

export function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-b border-gray-100 p-4", className)} {...props} />
  );
}

export function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-base font-semibold text-gray-900", className)}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)} {...props} />
  );
}

export function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex justify-end gap-2 border-t border-gray-100 p-4",
        className,
      )}
      {...props}
    />
  );
}

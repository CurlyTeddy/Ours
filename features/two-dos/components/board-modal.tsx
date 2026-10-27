"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-11.5 w-full rounded-[14px] border-0 bg-us-surface px-3.5 text-base font-bold text-us-ink shadow-[inset_0_0_0_1px_var(--us-field-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_#4F70A8] min-[901px]:text-[15px]";
const labelClass =
  "text-xs font-black tracking-[.12em] text-us-muted uppercase";
const primaryButton =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#4F70A8] px-5 text-sm font-extrabold text-white transition-[background-color,scale] duration-150 select-none hover:bg-[#3F5F96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] active:scale-[.97] aria-disabled:cursor-not-allowed aria-disabled:bg-[#8EA3C6] aria-disabled:active:scale-100";
const ghostButton =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-us-subtle px-4 text-sm font-extrabold text-us-ink transition-[background-color,scale] duration-150 select-none hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8] active:scale-[.97]";

// The Two Do dialog shell: a centered card, or a bottom sheet with a grab bar on phones.
function BoardModal({
  label,
  sheet = false,
  onClose,
  className,
  children,
}: {
  label: string;
  sheet?: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      {/* No portal: the fonts are set on the page shell, not on body */}
      <DialogPrimitive.Overlay className="us-palette fixed inset-0 z-50 animate-fade bg-us-scrim backdrop-blur-[6px]" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "us-palette fixed z-50 flex flex-col gap-4.5 overflow-auto overscroll-contain border border-us-line bg-us-panel font-ui text-us-ink shadow-[0_34px_60px_-30px_rgba(31,43,66,.6)] outline-none",
          sheet
            ? "inset-x-0 bottom-0 max-h-[88dvh] animate-sheet-up motion-reduce:animate-fade rounded-t-[28px] border-b-0 px-5 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
            : "top-1/2 left-1/2 max-h-[calc(100dvh-48px)] w-[calc(100%-32px)] max-w-110 -translate-1/2 animate-rise rounded-[28px] p-6.5",
          className,
        )}
      >
        {sheet ? (
          <span
            aria-hidden="true"
            className="h-1.25 w-10 flex-none self-center rounded-full bg-[rgba(31,43,66,.18)]"
          />
        ) : null}
        <DialogPrimitive.Title className="sr-only">
          {label}
        </DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { BoardModal, fieldClass, ghostButton, labelClass, primaryButton };

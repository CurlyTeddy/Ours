import type { MouseEvent, PointerEvent } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// The stack of blank sheets: drag one onto the wall, or press to add one at the view center.
function NotePad({
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyboardPress,
}: {
  className?: string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (cancelled: boolean) => void;
  onKeyboardPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="New note. Drag a sheet onto the wall, or press to add one"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => onPointerUp(false)}
      onPointerCancel={() => onPointerUp(true)}
      // Pointer presses are handled on release; a click with detail 0 is Enter or Space.
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) onKeyboardPress();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "group absolute top-23 right-18 z-5 size-52.5 cursor-grab touch-none select-none [-webkit-touch-callout:none] focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-[#4F70A8] max-[900px]:top-auto max-[900px]:right-3 max-[900px]:bottom-4 max-[900px]:size-23",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-2.5 translate-y-3 rotate-4 rounded-[3px] bg-[#B4C7E6] shadow-[0_14px_20px_-14px_rgba(31,43,66,.5)] max-[900px]:translate-x-1.5 max-[900px]:translate-y-1.75"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1.25 translate-y-1.5 rotate-[1.5deg] rounded-[3px] bg-[#C4D4EE] max-[900px]:translate-0.75"
      />
      <span className="us-paper absolute inset-0 flex -rotate-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-[3px] bg-[#D3E0F4] shadow-[0_1px_1px_rgba(31,43,66,.08),0_10px_18px_-12px_rgba(31,43,66,.45)] transition-[rotate,translate] duration-250 ease-us group-hover:-translate-x-1.5 group-hover:-translate-y-2 group-hover:-rotate-4 max-[900px]:-rotate-2 max-[900px]:gap-1">
        <span
          aria-hidden="true"
          className="flex size-13 items-center justify-center rounded-full bg-us-surface text-[#4F70A8] shadow-[0_6px_14px_-8px_rgba(31,43,66,.5)] max-[900px]:size-auto max-[900px]:bg-transparent max-[900px]:shadow-none"
        >
          <Plus size={22} strokeWidth={2.6} />
        </span>
        <span className="font-hand text-[32px] leading-none font-bold text-us-ink max-[900px]:hidden">
          New note
        </span>
        <span className="text-xs font-extrabold text-us-muted max-[900px]:hidden">
          Drag onto the wall
        </span>
        <span className="font-hand text-xl leading-none font-bold text-us-ink min-[901px]:hidden">
          New
        </span>
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-8.5 rounded-tl-md bg-[linear-gradient(315deg,var(--us-wall)_50%,#B4C7E6_50%)] shadow-[-2px_-2px_4px_rgba(31,43,66,.1)] max-[900px]:size-5 max-[900px]:rounded-tl-sm"
        />
      </span>
    </button>
  );
}

export { NotePad };

import { cn } from "@/lib/utils";

function Vinyl({
  labelColor,
  spinning = false,
  className,
}: {
  labelColor: string;
  spinning?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "vinyl-disc flex size-full items-center justify-center",
        spinning && "animate-vinyl-spin motion-reduce:animate-none",
        className,
      )}
    >
      <div
        className="flex size-[36%] items-center justify-center rounded-full shadow-[inset_0_0_0_2px_rgba(0,0,0,.08)]"
        style={{ background: labelColor }}
      >
        <div className="size-[14%] rounded-full bg-[#1C2333]" />
      </div>
    </div>
  );
}

export { Vinyl };

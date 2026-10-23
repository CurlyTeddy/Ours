import { cn } from "@/lib/utils";
import type { NotePlace } from "@/features/moments/models/responses";
import { HeartIcon } from "@/features/moments/components/heart-icon";

// love-map.svg covers lon 100°→260° and lat 66°→-26°, so pins sit by percentage.
function cardPosition({ latitude, longitude }: NotePlace) {
  const lon = longitude < 0 ? longitude + 360 : longitude;
  return {
    left: `${((lon - 100) / 160) * 100}%`,
    top: `${((66 - latitude) / 92) * 100}%`,
  };
}

function LoveMapCard({
  places,
  onOpen,
  className,
}: {
  places: NotePlace[];
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Open Love Map: ${places.length} places`}
      onClick={onOpen}
      className={cn(
        "us-paper absolute top-137 left-250 z-4 h-43 w-75 cursor-pointer -rotate-3 rounded-[4px] bg-[#E6EDF6] shadow-[0_1px_1px_rgba(31,43,66,.1),0_18px_26px_-16px_rgba(31,43,66,.6)] transition-[opacity,rotate,translate] duration-[350ms,300ms,300ms] ease-[ease,cubic-bezier(.2,.8,.2,1),cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:-rotate-1 focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-[#4F70A8]",
        className,
      )}
    >
      <span className="absolute inset-0 overflow-hidden rounded-[4px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
        <img
          src="/moments/love-map.svg"
          alt=""
          draggable={false}
          className="absolute inset-0 block size-full"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(31,43,66,.07)_0_33.3%,rgba(255,255,255,.16)_33.3%_66.6%,rgba(31,43,66,.04)_66.6%_100%)]"
        />
        {places.map((place) => (
          <HeartIcon
            key={place.placeId}
            width={18}
            height={18}
            className="absolute -mt-4 -ml-2.25 text-[#4F70A8] [&_path]:stroke-white [&_path]:stroke-[1.8]"
            style={cardPosition(place)}
          />
        ))}
      </span>
      <span className="absolute -bottom-3 left-3 flex rotate-2 items-baseline gap-2 rounded-[3px] bg-[#FFFDF7] px-3 py-1.5 shadow-[0_8px_14px_-8px_rgba(31,43,66,.55)]">
        <span className="font-hand text-2xl leading-none font-bold text-us-ink">
          Love Map
        </span>
        <span className="text-[11px] font-extrabold text-us-muted">
          {places.length} places · tap to open
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute -top-2.75 left-1/2 z-2 -ml-10 h-5.5 w-20 rotate-3 bg-[rgba(196,212,238,.85)]"
      />
    </button>
  );
}

export { LoveMapCard };

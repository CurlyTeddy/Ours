"use client";

import {
  Check,
  Inbox,
  Plane,
  Sparkle,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapLayer } from "@/features/moments/map-layers";
import { listTodos } from "@/features/two-dos/lists";
import type { TripDto } from "@/features/two-dos/models/trip";
import type { Todo } from "@/features/two-dos/models/views";

interface LayerRow {
  layer: MapLayer;
  name: string;
  sub: string;
  icon: LucideIcon;
  tint: string;
  ink: string;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8]";
const activeRow =
  "bg-us-subtle shadow-[inset_0_0_0_1.5px_rgba(79,112,168,.45)]";

function layerRows(
  { places, notes }: { places: number; notes: number },
  todos: Todo[],
  trips: TripDto[],
) {
  const ideas = listTodos(todos, "inspiration").length;
  const unsorted = listTodos(todos, "unsorted").length;
  const lists: LayerRow[] = [
    {
      layer: "notes",
      name: "Notes",
      sub: `${places} places · ${notes} notes`,
      icon: StickyNote,
      tint: "#D3E0F4",
      ink: "#4F70A8",
    },
    {
      layer: "inspiration",
      name: "Inspiration",
      sub: `${plural(ideas, "idea", "ideas")} · no trip yet`,
      icon: Sparkle,
      tint: "#FAEDBE",
      ink: "#8A6A12",
    },
  ];
  if (unsorted > 0) {
    lists.push({
      layer: "unsorted",
      name: "Unsorted",
      sub: `${unsorted} done · waiting for a trip`,
      icon: Inbox,
      tint: "#E8ECF2",
      ink: "#4A5876",
    });
  }
  const tripRows = trips.map((trip): LayerRow => {
    const stops = listTodos(todos, trip.id);
    const done = stops.filter((stop) => stop.status).length;
    return {
      layer: trip.id,
      name: trip.name,
      sub: `${stops.length} stops${done ? ` · ${done} done` : ""}`,
      icon: Plane,
      tint: "#D3E0F4",
      ink: "#4F70A8",
    };
  });
  return { lists, tripRows };
}

function LayerIcon({ row, className }: { row: LayerRow; className: string }) {
  const Icon = row.icon;
  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-none items-center justify-center", className)}
      style={{ background: row.tint, color: row.ink }}
    >
      <Icon size={18} strokeWidth={2.2} />
    </span>
  );
}

// The "Show on map" switch: a card with each trip's stops on desktop, a chip row on phones.
function MapLayers({
  layer,
  isPhone,
  noteCounts,
  todos,
  trips,
  onPick,
  onFly,
}: {
  layer: MapLayer;
  isPhone: boolean;
  noteCounts: { places: number; notes: number };
  todos: Todo[];
  trips: TripDto[];
  onPick: (layer: MapLayer) => void;
  onFly: (stop: Todo) => void;
}) {
  const { lists, tripRows } = layerRows(noteCounts, todos, trips);

  if (isPhone) {
    return (
      <div
        data-nopan=""
        role="group"
        aria-label="Show on map"
        className="absolute inset-x-3 bottom-3.5 z-5 flex gap-1 overflow-x-auto overscroll-x-contain rounded-[22px] border border-us-line bg-us-panel p-1.25 shadow-[0_14px_30px_-20px_rgba(31,43,66,.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[...lists, ...tripRows].map((row) => (
          <button
            key={row.layer}
            type="button"
            aria-pressed={layer === row.layer}
            onClick={() => onPick(row.layer)}
            className={cn(
              "inline-flex h-11.5 flex-none cursor-pointer items-center gap-2 rounded-2xl py-0 pr-3.5 pl-1.5 text-[13.5px] font-extrabold whitespace-nowrap text-us-ink select-none",
              focusRing,
              layer === row.layer && activeRow,
            )}
          >
            <LayerIcon row={row} className="size-8.5 rounded-[11px]" />
            {row.name}
          </button>
        ))}
      </div>
    );
  }

  const renderRow = (row: LayerRow) => {
    const on = layer === row.layer;
    const isTrip = trips.some((trip) => trip.id === row.layer);
    const stops = on && isTrip ? listTodos(todos, row.layer) : [];
    return (
      <li key={row.layer} className="flex flex-col">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onPick(row.layer)}
          className={cn(
            "flex min-h-13 w-full cursor-pointer items-center gap-2.5 rounded-2xl py-1.5 pr-2.5 pl-1.5 text-left text-us-ink transition-colors duration-200 select-none hover:bg-us-hover",
            focusRing,
            on && activeRow,
          )}
        >
          <LayerIcon row={row} className="size-9.5 rounded-xl" />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[14.5px] font-black">
              {row.name}
            </span>
            <span className="text-xs font-bold whitespace-nowrap text-us-muted">
              {row.sub}
            </span>
          </span>
          {on ? (
            <Check
              size={18}
              strokeWidth={2.8}
              aria-hidden="true"
              className="flex-none text-[#4F70A8]"
            />
          ) : null}
        </button>
        {stops.length ? (
          <ol
            aria-label={`${row.name} stops`}
            className="m-0 mb-1 flex list-none flex-col gap-0.5 py-0.5 pr-0 pb-1 pl-6"
          >
            {stops.map((stop, index) => (
              <li key={stop.id}>
                <button
                  type="button"
                  disabled={!stop.location}
                  onClick={() => onFly(stop)}
                  className={cn(
                    "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1 text-left text-[13px] font-extrabold text-us-ink hover:bg-us-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 flex-none items-center justify-center rounded-full text-[11.5px] font-black",
                      stop.status
                        ? "bg-[#4F70A8] text-white"
                        : "bg-us-surface text-[#4F70A8] shadow-[inset_0_0_0_2px_#4F70A8]",
                    )}
                  >
                    {stop.status ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{stop.title}</span>
                  {stop.location ? (
                    <span className="flex-none text-[11.5px] font-bold text-us-muted">
                      {stop.location.name}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </li>
    );
  };

  return (
    <div
      data-nopan=""
      role="group"
      aria-label="Show on map"
      className="absolute top-10 left-10 z-1500 flex max-h-[calc(100%-140px)] w-72.5 animate-[fade_.3s_.15s_ease_both] flex-col gap-0.5 overflow-auto overscroll-contain rounded-3xl border border-us-line bg-us-panel p-3 shadow-[0_22px_44px_-28px_rgba(31,43,66,.55)]"
    >
      <span className="px-2 pt-0.5 pb-2 text-xs font-black tracking-[.12em] text-us-muted uppercase">
        Show on map
      </span>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {lists.map(renderRow)}
      </ul>
      {tripRows.length ? (
        <>
          <span className="px-2 pt-3 pb-1 text-xs font-black tracking-[.12em] text-us-muted uppercase">
            Trips
          </span>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {tripRows.map(renderRow)}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export { MapLayers };

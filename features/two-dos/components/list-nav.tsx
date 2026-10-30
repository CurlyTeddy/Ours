"use client";

import { useRef, type ReactNode } from "react";
import Image from "next/image";
import { GripVertical, Inbox, Plane, Plus, Sparkle } from "lucide-react";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { cn } from "@/lib/utils";
import { tripDates, tripTint, type ListKey } from "@/features/two-dos/lists";
import {
  landingOrder,
  useDraggable,
  useDropTarget,
  type DragState,
  type DropData,
} from "@/features/two-dos/hooks/use-drag";
import type { TripDto } from "@/features/two-dos/models/trip";

interface TripSummary {
  id: string;
  trip: TripDto;
  done: number;
  total: number;
  // The first image among its stops, in itinerary order
  cover: string | null;
}

interface ListNavProps {
  selected: ListKey;
  inspirationCount: number;
  unsortedCount: number;
  trips: TripSummary[];
  drag: DragState | null;
  // A done to-do is hovering Inspiration, which refuses it
  refusing: boolean;
  onSelect: (key: ListKey) => void;
  onNewTrip: () => void;
}

const tripPitch = 72;

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8]";
const selectedRing =
  "bg-us-subtle shadow-[inset_0_0_0_1.5px_var(--us-sel-line)]";
const overRing = "bg-us-drop shadow-[inset_0_0_0_2px_#4F70A8]";
const refusedRing = "animate-nope shadow-[inset_0_0_0_2px_var(--us-danger)]";
const countPill =
  "inline-flex h-6.5 min-w-7 flex-none items-center justify-center rounded-full bg-us-surface px-2.25 text-[12.5px] font-black text-us-ink shadow-[inset_0_0_0_1px_var(--us-hair)]";

const progress = ({ done, total }: TripSummary) => `${done}/${total}`;

function TripCover({
  summary,
  className,
}: {
  summary: TripSummary;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex flex-none items-center justify-center overflow-hidden text-[#4F70A8]",
        className,
      )}
      style={{ background: tripTint(summary.id) }}
    >
      {summary.cover ? (
        <Image
          src={summary.cover}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
        />
      ) : (
        <Plane size={20} strokeWidth={2} />
      )}
    </span>
  );
}

function ListButton({
  list,
  selected,
  state,
  dropList,
  onSelect,
  className,
  children,
}: {
  list: ListKey;
  selected: boolean;
  state: "over" | "refused" | null;
  // The list a to-do dropped here joins; omitted for Unsorted, which takes no drops
  dropList?: ListKey;
  onSelect: (key: ListKey) => void;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useDropTarget(ref, dropList ? ["todo"] : [], () => ({
    target: "list",
    list: dropList ?? list,
  }));
  return (
    <button
      ref={ref}
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(list)}
      className={cn(
        className,
        focusRing,
        selected && selectedRing,
        state === "over" && overRing,
        state === "refused" && refusedRing,
      )}
    >
      {children}
    </button>
  );
}

function listState(drag: DragState | null, list: ListKey, refusing: boolean) {
  if (drag?.kind !== "todo" || drag.over !== list) return null;
  return refusing ? "refused" : "over";
}

const groupRow =
  "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-[18px] px-3 py-2.5 text-left text-us-ink transition-[background-color,box-shadow] duration-200 select-none hover:bg-us-hover";

function SidebarTripRow({
  summary,
  slot,
  selected,
  dragging,
  over,
  onSelect,
}: {
  summary: TripSummary;
  slot: number;
  selected: boolean;
  dragging: boolean;
  over: boolean;
  onSelect: (key: ListKey) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  useDraggable(rowRef, { kind: "trip", id: summary.id }, handleRef);
  useDropTarget(rowRef, ["todo"], () => ({ target: "list", list: summary.id }));
  const { trip, done, total } = summary;
  return (
    <div
      ref={rowRef}
      className={cn(
        "absolute inset-x-0 top-0 flex h-16 items-center gap-0.5 transition-transform duration-200 ease-us motion-reduce:transition-none",
        dragging && "opacity-45",
      )}
      style={{ transform: `translateY(${slot * tripPitch}px)` }}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Drag to reorder ${trip.name}`}
        className="flex h-11 w-8 flex-none cursor-grab touch-none items-center justify-center rounded-[10px] text-us-muted select-none hover:bg-us-hover hover:text-us-ink active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-current={selected ? "page" : undefined}
        onClick={() => onSelect(summary.id)}
        className={cn(
          "flex h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[18px] pr-3 pl-1.5 text-left text-us-ink transition-[background-color,box-shadow] duration-200 select-none hover:bg-us-hover",
          focusRing,
          selected && selectedRing,
          over && overRing,
        )}
      >
        <TripCover summary={summary} className="size-11 rounded-[13px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="truncate text-[15px] font-black">{trip.name}</span>
          <span className="flex items-center gap-2 text-xs font-bold whitespace-nowrap text-us-muted">
            <span className="truncate">{tripDates(trip)}</span>
            <span
              aria-hidden="true"
              className="h-1 w-10 flex-none overflow-hidden rounded-xs bg-us-hair"
            >
              <span
                className="block h-full rounded-xs bg-[#4F70A8]"
                style={{
                  width: `${total ? Math.round((done / total) * 100) : 0}%`,
                }}
              />
            </span>
            <span className="flex-none">{progress(summary)}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

function TripSidebar({
  selected,
  inspirationCount,
  unsortedCount,
  trips,
  drag,
  refusing,
  onSelect,
  onNewTrip,
}: ListNavProps) {
  const tripsRef = useRef<HTMLDivElement>(null);
  useDropTarget(tripsRef, ["trip"], () => ({ target: "trips" }));
  const tripDrag = drag?.kind === "trip" ? drag : null;
  const order = landingOrder(trips, tripDrag);

  return (
    <aside
      aria-label="Trips"
      className="flex min-w-0 flex-[0_0_330px] flex-col gap-1.5 rounded-[28px] border border-us-line bg-us-panel px-4 pt-5 pb-4 shadow-[0_1px_2px_rgba(31,43,66,.04),0_22px_44px_-32px_rgba(31,43,66,.4)]"
    >
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <h1 className="origin-left -rotate-2 pt-2 font-title text-[27px] leading-normal font-normal whitespace-nowrap">
          Our <span className="text-us-accent">Trips</span>
        </h1>
        <button
          type="button"
          aria-label="New trip"
          onClick={onNewTrip}
          className={cn(
            "flex size-11 flex-none cursor-pointer items-center justify-center rounded-full bg-[#4F70A8] text-white transition-[background-color,scale] duration-150 hover:bg-[#3F5F96] active:scale-[.95]",
            focusRing,
          )}
        >
          <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>

      <ListButton
        list="inspiration"
        dropList="inspiration"
        selected={selected === "inspiration"}
        state={listState(drag, "inspiration", refusing)}
        onSelect={onSelect}
        className={groupRow}
      >
        <span
          aria-hidden="true"
          className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-[#FAEDBE] text-[#8A6A12]"
        >
          <Sparkle size={20} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-black">Inspiration</span>
          <span className="text-[12.5px] font-bold text-us-muted">
            Ideas for someday
          </span>
        </span>
        <span className={countPill}>{inspirationCount}</span>
      </ListButton>

      {unsortedCount > 0 || selected === "unsorted" ? (
        <ListButton
          list="unsorted"
          selected={selected === "unsorted"}
          state={null}
          onSelect={onSelect}
          className={groupRow}
        >
          <span
            aria-hidden="true"
            className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-us-subtle text-us-muted"
          >
            <Inbox size={20} strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base font-black">Unsorted</span>
            <span className="text-[12.5px] font-bold text-us-muted">
              Done · waiting for a trip
            </span>
          </span>
          <span className={countPill}>{unsortedCount}</span>
        </ListButton>
      ) : null}

      <div className="flex items-baseline justify-between gap-2 px-1.5 pt-3.5 pb-1.5">
        <span className="text-xs font-black tracking-[.12em] text-us-muted uppercase">
          Trips
        </span>
        <span className="text-xs font-bold text-us-muted">Drag to reorder</span>
      </div>

      <div
        ref={tripsRef}
        className="relative"
        style={{ height: Math.max(0, trips.length * tripPitch - 8) }}
      >
        {trips.map((summary) => (
          <SidebarTripRow
            key={summary.id}
            summary={summary}
            slot={order.indexOf(summary)}
            selected={selected === summary.id}
            dragging={tripDrag?.id === summary.id}
            over={listState(drag, summary.id, false) === "over"}
            onSelect={onSelect}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onNewTrip}
        className={cn(
          "mt-1.5 inline-flex h-13 cursor-pointer items-center justify-center gap-2 rounded-[18px] text-sm font-extrabold text-us-muted shadow-[inset_0_0_0_1.5px_var(--us-dash)] transition-colors select-none hover:bg-us-hover",
          focusRing,
        )}
      >
        <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
        New trip
      </button>
    </aside>
  );
}

const chipClass =
  "inline-flex h-11.5 flex-none cursor-pointer items-center gap-2 rounded-2xl py-0 pr-3 pl-1.5 text-[13.5px] font-extrabold whitespace-nowrap text-us-ink transition-[background-color,box-shadow] duration-200 select-none [-webkit-touch-callout:none]";
const chipIcon =
  "flex size-8.5 flex-none items-center justify-center rounded-[11px]";
const chipCount =
  "inline-flex h-5.5 min-w-6 items-center justify-center rounded-full bg-us-surface px-1.75 text-[11.5px] font-black text-us-ink shadow-[inset_0_0_0_1px_var(--us-hair)]";

// Hold a trip chip to drag it along the row; it lands on the side of the chip it is over.
function TripChip({
  summary,
  selected,
  drag,
  onSelect,
}: {
  summary: TripSummary;
  selected: boolean;
  drag: DragState | null;
  onSelect: (key: ListKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDraggable(ref, { kind: "trip", id: summary.id });
  useDropTarget(
    ref,
    ["todo", "trip"],
    ({ input, element }) =>
      attachClosestEdge(
        { target: "list", list: summary.id },
        { element, input, allowedEdges: ["left", "right"] },
      ) as DropData & Record<string | symbol, unknown>,
  );
  const edge =
    drag?.kind === "trip" && drag.edge?.id === summary.id
      ? drag.edge.side
      : null;
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex-none",
        drag?.kind === "trip" && drag.id === summary.id && "opacity-45",
      )}
    >
      {edge ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-1 z-1 w-0.5 rounded-full bg-[#4F70A8]",
            edge === "left" ? "-left-0.75" : "-right-0.75",
          )}
        />
      ) : null}
      <button
        type="button"
        aria-current={selected ? "page" : undefined}
        onClick={() => onSelect(summary.id)}
        className={cn(
          chipClass,
          focusRing,
          selected && selectedRing,
          listState(drag, summary.id, false) === "over" && overRing,
        )}
      >
        <span
          aria-hidden="true"
          className={chipIcon}
          style={{ background: tripTint(summary.id) }}
        >
          <Plane size={16} strokeWidth={2} className="text-[#4F70A8]" />
        </span>
        <span className="max-w-40 truncate">{summary.trip.name}</span>
        <span className={chipCount}>{progress(summary)}</span>
      </button>
    </div>
  );
}

function ListChips({
  selected,
  inspirationCount,
  unsortedCount,
  trips,
  drag,
  refusing,
  onSelect,
  onNewTrip,
}: ListNavProps) {
  return (
    <div
      role="group"
      aria-label="Lists and trips"
      className="flex w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain rounded-[22px] border border-us-line bg-us-panel p-1.25 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ListButton
        list="inspiration"
        dropList="inspiration"
        selected={selected === "inspiration"}
        state={listState(drag, "inspiration", refusing)}
        onSelect={onSelect}
        className={chipClass}
      >
        <span
          aria-hidden="true"
          className={cn(chipIcon, "bg-[#FAEDBE] text-[#8A6A12]")}
        >
          <Sparkle size={16} strokeWidth={2.2} />
        </span>
        Inspiration
        <span className={chipCount}>{inspirationCount}</span>
      </ListButton>
      {unsortedCount > 0 || selected === "unsorted" ? (
        <ListButton
          list="unsorted"
          selected={selected === "unsorted"}
          state={null}
          onSelect={onSelect}
          className={chipClass}
        >
          <span
            aria-hidden="true"
            className={cn(chipIcon, "bg-us-subtle text-us-muted")}
          >
            <Inbox size={16} strokeWidth={2.2} />
          </span>
          Unsorted
          <span className={chipCount}>{unsortedCount}</span>
        </ListButton>
      ) : null}
      {trips.map((summary) => (
        <TripChip
          key={summary.id}
          summary={summary}
          selected={selected === summary.id}
          drag={drag}
          onSelect={onSelect}
        />
      ))}
      <button
        type="button"
        aria-label="New trip"
        onClick={onNewTrip}
        className={cn(chipClass, "px-1.5", focusRing)}
      >
        <span
          aria-hidden="true"
          className={cn(
            chipIcon,
            "text-us-muted shadow-[inset_0_0_0_1.5px_var(--us-dash)]",
          )}
        >
          <Plus size={16} strokeWidth={2.6} />
        </span>
      </button>
    </div>
  );
}

export { ListChips, TripSidebar, tripPitch };
export type { TripSummary };

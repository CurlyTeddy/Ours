"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BoardModal,
  fieldClass,
  ghostButton,
  labelClass,
  primaryButton,
} from "@/features/two-dos/components/board-modal";
import { listTodos, tripDates, tripTint } from "@/features/two-dos/lists";
import type { TripDto } from "@/features/two-dos/models/trip";
import type { Todo } from "@/features/two-dos/models/views";

const stops = (count: number) => (count === 1 ? "1 stop" : `${count} stops`);

// "pick": a ticked idea needs the trip it was done on. "move": an Unsorted item finds its trip.
function PickTripDialog({
  mode,
  todo,
  todos,
  trips,
  sheet,
  onPick,
  onCreate,
  onClose,
}: {
  mode: "pick" | "move";
  todo: Todo;
  todos: Todo[];
  trips: TripDto[];
  sheet: boolean;
  onPick: (trip: TripDto) => Promise<unknown>;
  onCreate: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const question =
    mode === "pick"
      ? "Which trip was it on?"
      : `Which trip was “${todo.title}” on?`;
  const blank = name.trim() === "";

  const run = (action: () => Promise<unknown>) => {
    if (isPending) return;
    startTransition(async () => {
      await action();
    });
  };

  return (
    <BoardModal
      label={mode === "pick" ? question : "Move to which trip?"}
      sheet={sheet}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{mode === "pick" ? "Done!" : "Move"}</span>
        <h3 className="text-[22px] leading-[1.3] font-black max-[900px]:text-[21px]">
          {question}
        </h3>
        {mode === "pick" ? (
          <span className="text-sm leading-normal font-bold text-us-muted">
            “{todo.title}” will move out of Inspiration and into that trip.
          </span>
        ) : null}
      </div>

      {trips.length ? (
        <div className="flex flex-col gap-2">
          {trips.map((trip) => (
            <button
              key={trip.id}
              type="button"
              disabled={isPending}
              onClick={() => run(() => onPick(trip))}
              className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl bg-us-subtle px-3 py-2 text-left transition-[background-color,scale] duration-150 select-none hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] active:scale-[.98] disabled:cursor-progress"
            >
              <span
                aria-hidden="true"
                className="flex size-9 flex-none items-center justify-center rounded-[11px] text-[#4F70A8]"
                style={{ background: tripTint(trip.id) }}
              >
                <Plane size={17} strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-[15px] font-black">
                  {trip.name}
                </span>
                <span className="text-xs font-bold text-us-muted">
                  {`${tripDates(trip)} · ${stops(listTodos(todos, trip.id).length)}`}
                </span>
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2.4}
                aria-hidden="true"
                className="flex-none text-us-muted min-[901px]:hidden"
              />
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2 border-t border-us-line pt-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blank) run(() => onCreate(name.trim()));
        }}
      >
        <label className={labelClass} htmlFor="pick-new-trip">
          Or start a new trip
        </label>
        <div className="flex gap-2">
          <input
            id="pick-new-trip"
            type="text"
            value={name}
            maxLength={80}
            placeholder="Trip name"
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />
          <button
            type="submit"
            aria-disabled={blank || isPending}
            className={cn(
              primaryButton,
              "h-11.5 flex-none rounded-[14px] px-4 max-[900px]:px-3.5",
            )}
          >
            Create &amp; move
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={onClose}
        className={cn(ghostButton, "rounded-[14px]")}
      >
        {mode === "pick" ? "Not yet — keep it unticked" : "Cancel"}
      </button>
    </BoardModal>
  );
}

export { PickTripDialog };

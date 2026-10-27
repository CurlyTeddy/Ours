"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ky from "ky";
import { toast } from "sonner";
import { Ellipsis, Map as MapIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { DragLocationHistory } from "@atlaskit/pragmatic-drag-and-drop/types";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  freePriority,
  listKeyOf,
  listTodos,
  priorityBetween,
  tripDates,
  tripTint,
  type ListKey,
} from "@/features/two-dos/lists";
import {
  attempt,
  toastWithUndo,
  useTodoMoves,
  type TripFields,
} from "@/features/two-dos/hooks/use-todo-moves";
import {
  isDragSource,
  type DragState,
  type DropData,
} from "@/features/two-dos/hooks/use-drag";
import {
  ListChips,
  TripSidebar,
  tripPitch,
  type TripSummary,
} from "@/features/two-dos/components/list-nav";
import {
  rowPitch,
  TodoList,
  type ListKind,
} from "@/features/two-dos/components/todo-list";
import { TripDialog } from "@/features/two-dos/components/trip-dialog";
import { TodoDialog } from "@/features/two-dos/components/todo-dialog";
import { PickTripDialog } from "@/features/two-dos/components/pick-trip-dialog";
import type { TripDto } from "@/features/two-dos/models/trip";
import type { Todo } from "@/features/two-dos/models/views";

type Modal =
  | { type: "new-trip" }
  | { type: "edit-trip"; trip: TripDto }
  | { type: "todo"; todo?: Todo }
  | { type: "pick" | "move"; todo: Todo };

const refusedMessage =
  "Inspiration only holds things you haven’t done yet — drop it on a trip instead";

const stops = (count: number) => (count === 1 ? "1 stop" : `${count} stops`);

const listTint = (kind: ListKind, key: ListKey) => {
  if (kind === "trip") return tripTint(key);
  return kind === "inspiration" ? "#FAEDBE" : "#E3EAF6";
};

const emptyCopy: Record<ListKind, { title: string; sub: string }> = {
  trip: {
    title: "No stops yet",
    sub: "Drag ideas from Inspiration onto this trip in the list on the left, or add a to-do here.",
  },
  inspiration: {
    title: "No ideas right now",
    sub: "Add the next thing you two want to do together.",
  },
  unsorted: {
    title: "All sorted",
    sub: "Everything done now lives inside a trip.",
  },
};

function warn(message: string) {
  toast(message, {
    duration: 3200,
    style: { background: "#7A2F3D", color: "#FFFFFF", border: 0 },
  });
}

// The dropped item's index in its list, read from the pointer's distance down the list.
function slotAt(
  location: DragLocationHistory,
  target: DropData["target"],
  pitch: number,
  count: number,
) {
  const hit = location.current.dropTargets.find(
    (dropTarget) => (dropTarget.data as DropData).target === target,
  );
  if (!hit) return null;
  const top = hit.element.getBoundingClientRect().top;
  const index = Math.floor((location.current.input.clientY - top) / pitch);
  return Math.min(Math.max(index, 0), count - 1);
}

// On a phone the two actions share the row with the 44px ⋯, so their labels may truncate
const actionButton =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-extrabold whitespace-nowrap transition-[background-color,scale] duration-150 select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] active:scale-[.97] max-[900px]:min-w-0 max-[900px]:flex-1 max-[900px]:gap-1.5 max-[900px]:px-3 max-[900px]:text-[13px]";

function BoardSkeleton({ isPhone }: { isPhone: boolean }) {
  return (
    <>
      {isPhone ? (
        <Skeleton className="h-14.5 w-full rounded-[22px]" />
      ) : (
        <div className="flex flex-[0_0_330px] flex-col gap-3 rounded-[28px] border border-us-line bg-us-panel p-5">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-16 w-full rounded-[18px]" />
          <Skeleton className="h-16 w-full rounded-[18px]" />
          <Skeleton className="h-16 w-full rounded-[18px]" />
        </div>
      )}
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-[28px] border border-us-line bg-us-panel p-7 max-[900px]:p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-56" />
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-22 w-full rounded-[22px]" />
        ))}
      </div>
    </>
  );
}

function TwoDoBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPhone = useMediaQuery("(max-width: 900px)");
  const moves = useTodoMoves();
  const {
    todos,
    trips,
    place,
    createTrip,
    updateTrip,
    deleteTrip,
    moveWithUndo,
    nextPriority,
  } = moves;
  const [modal, setModal] = useState<Modal | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const requested = searchParams.get("list");
  const selected: ListKey =
    requested === "unsorted" || trips.some((trip) => trip.id === requested)
      ? (requested as ListKey)
      : "inspiration";
  const selectedTrip = trips.find((trip) => trip.id === selected);
  const kind: ListKind = selectedTrip ? "trip" : (selected as ListKind);
  const rows = listTodos(todos, selected);

  const select = (key: ListKey) =>
    router.replace(`/twodo?list=${encodeURIComponent(key)}`, { scroll: false });

  const nameOf = (key: ListKey) => {
    if (key === "inspiration") return "Inspiration";
    if (key === "unsorted") return "Unsorted";
    return trips.find((trip) => trip.id === key)?.name ?? "";
  };

  const summaries: TripSummary[] = trips.map((trip) => {
    const tripStops = listTodos(todos, trip.id);
    return {
      id: trip.id,
      trip,
      done: tripStops.filter((stop) => stop.status).length,
      total: tripStops.length,
      cover:
        tripStops.find((stop) => stop.images.length)?.images[0].url ?? null,
    };
  });
  const draggedTodo =
    drag?.kind === "todo"
      ? todos.find((todo) => todo.id === drag.id)
      : undefined;
  const refusing =
    drag?.kind === "todo" &&
    drag.over === "inspiration" &&
    Boolean(draggedTodo?.status);

  // ---------- moves ----------

  const toggle = (todo: Todo) => {
    if (kind === "inspiration") {
      setModal({ type: "pick", todo });
    } else if (kind === "unsorted") {
      void moveWithUndo(
        todo,
        { done: false, priority: nextPriority() },
        "Unticked — back in Inspiration",
      );
    } else {
      void attempt(
        () => place(todo.id, { done: !todo.status }),
        "Failed to update the to-do. Please try again.",
      );
    }
  };

  // Ticks an idea into a trip (pick) or files an Unsorted item there (move).
  const fileInto = async (
    todo: Todo,
    mode: "pick" | "move",
    trip: TripDto,
    createdTripId?: string,
  ) => {
    const moved = await moveWithUndo(
      todo,
      mode === "pick" ? { tripId: trip.id, done: true } : { tripId: trip.id },
      mode === "pick"
        ? `Done · moved to ${trip.name}`
        : `Moved to ${trip.name}`,
      createdTripId,
    );
    if (moved) setModal(null);
    return moved;
  };

  const fileIntoNewTrip = async (
    todo: Todo,
    mode: "pick" | "move",
    name: string,
  ) => {
    let trip: TripDto | undefined;
    const created = await attempt(async () => {
      trip = await createTrip({ name, startDate: null, endDate: null });
    }, "Failed to create a trip. Please try again later.");
    if (!created || !trip) return;
    const { id } = trip;
    // A trip made only for this move must not outlive a failed move
    if (!(await fileInto(todo, mode, trip, id))) {
      await attempt(
        () => deleteTrip(id),
        "Failed to delete the trip. Please try again later.",
      );
    }
  };

  const saveTrip = async (fields: TripFields, trip?: TripDto) =>
    attempt(
      async () => {
        if (trip) {
          await updateTrip(trip.id, fields);
          toast("Saved");
          return;
        }
        const created = await createTrip(fields);
        select(created.id);
        toast("Trip created");
      },
      trip
        ? "Failed to update the trip. Please try again later."
        : "Failed to create a trip. Please try again later.",
    );

  const removeTrip = async (trip: TripDto) => {
    const tripStops = listTodos(todos, trip.id);
    const removed = await attempt(
      () => deleteTrip(trip.id),
      "Failed to delete the trip. Please try again later.",
    );
    if (!removed) return;
    select("inspiration");
    toastWithUndo("Trip deleted", async () => {
      const again = await createTrip({
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
      });
      await updateTrip(again.id, { position: trip.position });
      for (const stop of tripStops) {
        await place(stop.id, {
          tripId: again.id,
          done: stop.status,
          priority: stop.priority,
        });
      }
    });
  };

  const onTodoSaved = (saved: Todo, previous?: Todo) => {
    setModal(null);
    const list = listKeyOf(saved);
    if (!previous) {
      select(list);
      toastWithUndo(`Added to ${nameOf(list)}`, async () => {
        await ky.delete(`${moves.todosKey}/${saved.id}`, { retry: 0 });
        await moves.mutateTodos(
          (current = []) => current.filter((todo) => todo.id !== saved.id),
          {
            revalidate: false,
          },
        );
      });
    } else if (saved.tripId !== previous.tripId) {
      toastWithUndo(`Saved · moved to ${nameOf(list)}`, () =>
        moves.restore([previous]),
      );
    } else {
      toast("Saved");
    }
  };

  // ---------- drag and drop ----------

  const onDrag = useEffectEvent(
    (source: Record<string, unknown>, location: DragLocationHistory) => {
      if (!isDragSource(source)) return;
      if (source.kind === "trip") {
        const chip = location.current.dropTargets.find(
          (target) => (target.data as DropData).target === "list",
        );
        const side = chip ? extractClosestEdge(chip.data) : null;
        const chipId = chip ? (chip.data as { list: string }).list : null;
        // Phones reorder along the chip row: land on the near side of the chip under the finger
        const chipEdge =
          isPhone && chipId !== null && (side === "left" || side === "right")
            ? { id: chipId, side }
            : null;
        let index = slotAt(location, "trips", tripPitch, trips.length);
        if (chipEdge) {
          const rest = trips.filter((trip) => trip.id !== source.id);
          const at = rest.findIndex((trip) => trip.id === chipEdge.id);
          index = at < 0 ? null : at + (chipEdge.side === "right" ? 1 : 0);
        }
        setDrag((current) => ({
          kind: "trip",
          id: source.id,
          index:
            index ??
            (current?.kind === "trip"
              ? current.index
              : trips.findIndex((trip) => trip.id === source.id)),
          edge: chipEdge?.id === source.id ? null : chipEdge,
        }));
        return;
      }
      const startIndex = rows.findIndex((todo) => todo.id === source.id);
      const list = location.current.dropTargets.find(
        (target) => (target.data as DropData).target === "list",
      );
      const over = list ? (list.data as { list: ListKey }).list : null;
      setDrag((current) => ({
        kind: "todo",
        id: source.id,
        over: over === selected ? null : over,
        index:
          slotAt(location, "rows", rowPitch, rows.length) ??
          (current?.kind === "todo" ? current.index : startIndex),
      }));
    },
  );

  const onDrop = useEffectEvent((location: DragLocationHistory) => {
    const finished = drag;
    setDrag(null);
    // Dropped outside every target, or cancelled with Escape: nothing moves
    if (!finished || !location.current.dropTargets.length) return;
    if (finished.kind === "trip") {
      const from = trips.findIndex((trip) => trip.id === finished.id);
      if (from < 0 || finished.index === from) return;
      const rest = trips.filter((trip) => trip.id !== finished.id);
      const position = priorityBetween(
        finished.index > 0 ? rest[finished.index - 1].position : null,
        rest.at(finished.index)?.position ?? null,
      );
      void attempt(
        () => updateTrip(finished.id, { position }),
        "Failed to reorder the trips. Please try again.",
      );
      return;
    }
    const todo = todos.find((other) => other.id === finished.id);
    if (!todo) return;
    if (finished.over) {
      if (finished.over === "inspiration" && todo.status) {
        warn(refusedMessage);
        return;
      }
      void moveWithUndo(
        todo,
        { tripId: finished.over === "inspiration" ? null : finished.over },
        `Moved to ${nameOf(finished.over)}`,
      );
      return;
    }
    // Only a drop on the rows reorders; one on this list's own sidebar row or chip does nothing
    const onRows = location.current.dropTargets.some(
      (target) => (target.data as DropData).target === "rows",
    );
    const from = rows.findIndex((other) => other.id === finished.id);
    if (!onRows || from < 0 || finished.index === from) return;
    const rest = rows.filter((other) => other.id !== finished.id);
    void attempt(
      () =>
        place(todo.id, {
          priority: freePriority(
            finished.index > 0 ? rest[finished.index - 1].priority : null,
            rest.at(finished.index)?.priority ?? null,
            todos
              .filter((other) => other.id !== finished.id)
              .map((other) => other.priority),
          ),
        }),
      "Failed to reorder. Please try again.",
    );
  });

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isDragSource(source.data),
        onDragStart: ({ source, location }) => onDrag(source.data, location),
        onDrag: ({ source, location }) => onDrag(source.data, location),
        onDrop: ({ location }) => onDrop(location),
      }),
    // Effect Events always see the latest render and must stay out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------- render ----------

  const doneCount = rows.filter((todo) => todo.status).length;
  const percent = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;
  const head = selectedTrip
    ? {
        eyebrow: `Trip · ${stops(rows.length)} · ${tripDates(selectedTrip)}`,
        title: selectedTrip.name,
        sub: "The order is the itinerary — drag stops to plan the route. Ticked stops stay in place.",
        add: "Add to this trip",
        map: `/map?layer=${encodeURIComponent(selectedTrip.id)}`,
        label: `${selectedTrip.name} itinerary`,
      }
    : kind === "inspiration"
      ? {
          eyebrow: `Ideas · ${rows.length}`,
          title: "Inspiration",
          sub: "Things we want to do someday. Only undone items live here — tick one and pick the trip you did it on.",
          add: "Add idea",
          map: "/map?layer=inspiration",
          label: "Inspiration ideas",
        }
      : {
          eyebrow: `Done · ${rows.length}`,
          title: "Unsorted",
          sub: "Done before trips existed. Drag each one onto a trip on the left, or use “Move to…”. This list disappears once it is empty.",
          add: "Add to Inspiration",
          map: null,
          label: "Unsorted items",
        };
  const navProps = {
    selected,
    inspirationCount: listTodos(todos, "inspiration").length,
    unsortedCount: listTodos(todos, "unsorted").length,
    trips: summaries,
    drag,
    refusing,
    onSelect: select,
    onNewTrip: () => setModal({ type: "new-trip" }),
  };

  return (
    <main className="us-palette min-h-0 flex-1 overflow-y-auto overscroll-contain bg-us-page font-ui text-us-ink">
      <div className="mx-auto flex w-full max-w-360 flex-wrap items-start gap-6 px-8 pt-2 pb-10 max-[900px]:gap-3 max-[900px]:px-3 max-[900px]:pt-1 max-[900px]:pb-8">
        {moves.loading ? (
          <BoardSkeleton isPhone={isPhone} />
        ) : (
          <>
            {isPhone ? (
              <ListChips {...navProps} />
            ) : (
              <TripSidebar {...navProps} />
            )}

            <section
              aria-label={head.title}
              className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-[28px] border border-us-line bg-us-panel px-7 pt-7 pb-6 shadow-[0_1px_2px_rgba(31,43,66,.04),0_22px_44px_-32px_rgba(31,43,66,.4)] max-[900px]:gap-3.5 max-[900px]:rounded-[26px] max-[900px]:px-3.5 max-[900px]:py-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-4 max-[900px]:gap-3.5">
                <div className="flex min-w-0 flex-col gap-1 max-[900px]:gap-0.5 max-[900px]:px-0.5">
                  <span className="text-xs font-black tracking-[.12em] text-us-muted uppercase max-[900px]:text-[11.5px]">
                    {head.eyebrow}
                  </span>
                  <h2 className="font-hand text-[44px] leading-[1.1] font-bold break-words max-[900px]:text-[36px] max-[900px]:leading-[1.15]">
                    {head.title}
                  </h2>
                  <span className="max-w-140 text-sm leading-normal font-bold text-us-muted max-[900px]:text-[13px]">
                    {head.sub}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 max-[900px]:w-full max-[900px]:flex-nowrap">
                  {head.map ? (
                    <Link
                      href={head.map}
                      className={cn(
                        actionButton,
                        "bg-us-subtle text-us-ink hover:bg-us-hover",
                      )}
                    >
                      <MapIcon
                        size={16}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        className="flex-none"
                      />
                      <span className="truncate">Show on map</span>
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setModal({ type: "todo" })}
                    className={cn(
                      actionButton,
                      "bg-[#4F70A8] px-4.5 text-white hover:bg-[#3F5F96]",
                    )}
                  >
                    <Plus
                      size={16}
                      strokeWidth={2.6}
                      aria-hidden="true"
                      className="flex-none"
                    />
                    <span className="truncate">{head.add}</span>
                  </button>
                  {selectedTrip ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Trip options"
                        className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-[14px] bg-us-subtle text-us-ink transition-colors hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8]"
                      >
                        <Ellipsis
                          size={18}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            className="min-h-11 cursor-pointer font-bold"
                            onSelect={() =>
                              setModal({
                                type: "edit-trip",
                                trip: selectedTrip,
                              })
                            }
                          >
                            <Pencil aria-hidden="true" />
                            Edit trip
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className="min-h-11 cursor-pointer font-bold"
                            onSelect={() => void removeTrip(selectedTrip)}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete trip
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>

              {selectedTrip ? (
                <div className="flex items-center gap-3 max-[900px]:px-0.5">
                  <span
                    aria-hidden="true"
                    className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-us-hair"
                  >
                    <span
                      className="block h-full rounded-[3px] bg-[#4F70A8] transition-[width] duration-350 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="text-[13px] font-extrabold whitespace-nowrap text-us-muted">
                    {`${doneCount} of ${rows.length} done`}
                  </span>
                </div>
              ) : null}

              {rows.length ? (
                <TodoList
                  label={head.label}
                  kind={kind}
                  todos={rows}
                  tint={listTint(kind, selected)}
                  drag={drag}
                  onOpen={(todo) => setModal({ type: "todo", todo })}
                  onToggle={toggle}
                  onMove={(todo) => setModal({ type: "move", todo })}
                />
              ) : (
                <div className="flex flex-col items-center gap-2.5 rounded-[22px] px-4 py-9 text-center shadow-[inset_0_0_0_1.5px_var(--us-dash)]">
                  <span className="font-hand text-[30px] font-bold">
                    {emptyCopy[kind].title}
                  </span>
                  <span className="max-w-105 text-sm font-bold text-us-muted">
                    {emptyCopy[kind].sub}
                  </span>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {modal?.type === "new-trip" || modal?.type === "edit-trip" ? (
        <TripDialog
          initial={modal.type === "edit-trip" ? modal.trip : undefined}
          onSave={(fields) =>
            saveTrip(
              fields,
              modal.type === "edit-trip" ? modal.trip : undefined,
            )
          }
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.type === "todo" ? (
        <TodoDialog
          todo={modal.todo}
          defaultList={selected === "unsorted" ? "inspiration" : selected}
          trips={trips}
          onSaved={(saved) => onTodoSaved(saved, modal.todo)}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.type === "pick" || modal?.type === "move" ? (
        <PickTripDialog
          mode={modal.type}
          todo={modal.todo}
          todos={todos}
          trips={trips}
          sheet={isPhone}
          onPick={(trip) => fileInto(modal.todo, modal.type, trip)}
          onCreate={(name) => fileIntoNewTrip(modal.todo, modal.type, name)}
          onClose={() => setModal(null)}
        />
      ) : null}
    </main>
  );
}

export { TwoDoBoard };

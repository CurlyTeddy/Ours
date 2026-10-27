"use client";

import { useRef } from "react";
import Image from "next/image";
import { DateTime } from "luxon";
import { Check, GripVertical, MapPin, Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/components/providers/time-zone";
import { useUser } from "@/features/profile/hooks/user";
import {
  landingOrder,
  useDraggable,
  useDropTarget,
  type DragState,
} from "@/features/two-dos/hooks/use-drag";
import type { Todo } from "@/features/two-dos/models/views";

type ListKind = "trip" | "inspiration" | "unsorted";

const rowPitch = 96;

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8]";

function checkLabel(kind: ListKind, { title, status }: Todo) {
  if (kind === "inspiration") return `Mark “${title}” done and pick its trip`;
  if (!status) return `Mark “${title}” done`;
  return kind === "unsorted"
    ? `Untick “${title}” (moves back to Inspiration)`
    : `Mark “${title}” not done`;
}

// Next serves animated GIFs as-is anyway; this skips the /_next/image hop
const isGif = (key: string) =>
  key.substring(0, key.lastIndexOf("-")).toLowerCase().endsWith(".gif");

interface RowActions {
  onOpen: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
  onMove: (todo: Todo) => void;
}

function TodoRow({
  todo,
  kind,
  number,
  slot,
  tint,
  line,
  dragging,
  hidden,
  onOpen,
  onToggle,
  onMove,
}: RowActions & {
  todo: Todo;
  kind: ListKind;
  number: number;
  slot: number;
  tint: string;
  // The itinerary line down to the next stop
  line: "dashed" | "solid" | null;
  dragging: boolean;
  hidden: boolean;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  useDraggable(rowRef, { kind: "todo", id: todo.id }, handleRef);
  const timeZone = useTimeZone();
  const { user } = useUser();
  const image = todo.images.at(0);
  const creator = todo.createdBy.name;

  return (
    <li
      ref={rowRef}
      className={cn(
        "absolute inset-x-0 top-0 flex h-22 items-center gap-3 rounded-[22px] border border-us-line bg-us-surface px-3 transition-[transform,box-shadow,opacity] duration-200 ease-us hover:shadow-[0_12px_26px_-20px_rgba(31,43,66,.55)] motion-reduce:transition-none max-[900px]:gap-2 max-[900px]:px-2",
        dragging && "opacity-45",
        hidden && "opacity-0",
      )}
      style={{ transform: `translateY(${slot * rowPitch}px)` }}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Drag ${todo.title} to reorder or move`}
        // 32px drawn, 44px to touch: the hit area reaches 6px into the padding and gap
        className="relative flex h-11 w-8 flex-none cursor-grab touch-none after:absolute after:inset-y-0 after:-inset-x-1.5 after:content-[''] items-center justify-center rounded-[10px] text-us-muted select-none hover:bg-us-hover hover:text-us-ink active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {kind === "inspiration" ? (
        <span
          aria-hidden="true"
          className="flex size-8.5 flex-none items-center justify-center rounded-full bg-[#FAEDBE] text-[#8A6A12]"
        >
          <Sparkle size={16} strokeWidth={2.2} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "relative z-1 flex size-8.5 flex-none items-center justify-center rounded-full text-sm font-black transition-colors duration-250",
            todo.status
              ? "bg-[#4F70A8] text-white"
              : "bg-us-surface text-[#4F70A8] shadow-[inset_0_0_0_2px_#4F70A8]",
          )}
        >
          {todo.status ? <Check size={16} strokeWidth={3.2} /> : number}
        </span>
      )}
      {line ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-16.25 left-18 h-13.5 border-l-2 max-[900px]:left-16",
            line === "solid"
              ? "border-solid border-[#4F70A8]"
              : "border-dashed border-us-dash",
          )}
        />
      ) : null}

      <button
        type="button"
        aria-label={`Edit ${todo.title}`}
        onClick={() => onOpen(todo)}
        className={cn(
          "flex h-18 min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-[14px] pr-1 text-left text-inherit max-[900px]:gap-2.5",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="relative flex size-16 flex-none items-center justify-center overflow-hidden rounded-[14px] bg-[radial-gradient(rgba(79,112,168,.22)_1.2px,transparent_1.7px)] bg-size-[10px_10px] text-[#4F70A8] max-[900px]:hidden"
          style={{ backgroundColor: tint }}
        >
          {image ? (
            <Image
              src={image.url}
              alt=""
              fill
              sizes="64px"
              unoptimized={isGif(image.key)}
              className="object-cover"
            />
          ) : (
            <MapPin size={22} strokeWidth={2} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base leading-[1.3] font-black text-us-ink max-[900px]:text-[15px]">
            {todo.title}
          </span>
          <span className="flex items-center gap-2.5 overflow-hidden text-[12.5px] font-bold whitespace-nowrap text-us-muted max-[900px]:text-xs">
            <span className="inline-flex min-w-0 items-center gap-0.75 text-us-ink">
              <MapPin
                size={12}
                strokeWidth={2.6}
                aria-hidden="true"
                className="flex-none"
              />
              <span className="truncate">
                {todo.location?.name ?? "No location yet"}
              </span>
            </span>
            <span className="inline-flex flex-none items-center gap-1.25">
              <span
                aria-hidden="true"
                className="inline-flex size-4.5 items-center justify-center rounded-full text-[9px] font-black text-white"
                style={{
                  background: creator === user?.name ? "#4F70A8" : "#A8505F",
                }}
              >
                {creator.charAt(0).toUpperCase()}
              </span>
              {DateTime.fromISO(todo.createdAt, { zone: timeZone }).toFormat(
                "yyyy.MM.dd",
              )}
            </span>
          </span>
          <span className="truncate text-[13px] font-semibold text-us-muted max-[900px]:hidden">
            {todo.description || "—"}
          </span>
        </span>
      </button>

      {kind === "unsorted" ? (
        <button
          type="button"
          onClick={() => onMove(todo)}
          className={cn(
            "h-11 flex-none cursor-pointer rounded-xl bg-us-subtle px-3 text-[13px] font-extrabold text-us-ink transition-[background-color,scale] duration-150 select-none hover:bg-us-hover active:scale-[.97]",
            focusRing,
          )}
        >
          Move to…
        </button>
      ) : null}

      <button
        type="button"
        aria-label={checkLabel(kind, todo)}
        aria-pressed={todo.status}
        onClick={() => onToggle(todo)}
        className={cn(
          "flex size-11 flex-none cursor-pointer items-center justify-center rounded-full transition-[background-color,scale] duration-150 select-none hover:bg-us-hover active:scale-[.92]",
          focusRing,
          todo.status ? "text-[#4F70A8]" : "text-us-muted",
        )}
      >
        {todo.status ? (
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path
              d="M7.5 12.3l3 3 6-6.3"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
        )}
      </button>
    </li>
  );
}

// The list's rows sit in fixed slots, so a drag slides the others to open the landing slot.
function TodoList({
  label,
  kind,
  todos,
  tint,
  drag,
  ...actions
}: RowActions & {
  label: string;
  kind: ListKind;
  todos: Todo[];
  tint: string;
  drag: DragState | null;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useDropTarget(listRef, ["todo"], () => ({ target: "rows" }));
  const todoDrag =
    drag?.kind === "todo" && todos.some((todo) => todo.id === drag.id)
      ? drag
      : null;
  // Over another list, the dragged row leaves and the rest close up
  const order = todoDrag?.over
    ? todos.filter((todo) => todo.id !== todoDrag.id)
    : landingOrder(todos, todoDrag);

  return (
    <ol
      ref={listRef}
      aria-label={label}
      className="relative m-0 list-none p-0"
      style={{ height: Math.max(0, todos.length * rowPitch - 8) }}
    >
      {todos.map((todo) => {
        const position = order.indexOf(todo);
        const next = position >= 0 ? order.at(position + 1) : undefined;
        const isDragged = todoDrag?.id === todo.id;
        return (
          <TodoRow
            key={todo.id}
            todo={todo}
            kind={kind}
            number={position + 1}
            slot={position >= 0 ? position : todos.indexOf(todo)}
            tint={tint}
            line={
              kind === "trip" && next && !todoDrag
                ? todo.status && next.status
                  ? "solid"
                  : "dashed"
                : null
            }
            dragging={isDragged}
            hidden={isDragged && Boolean(todoDrag?.over)}
            {...actions}
          />
        );
      })}
    </ol>
  );
}

export { rowPitch, TodoList };
export type { ListKind };

import type { TripDto } from "@/features/two-dos/models/trip";
import type { Todo } from "@/features/two-dos/models/views";

// "inspiration", "unsorted", or a trip id
type ListKey = "inspiration" | "unsorted" | (string & {});

const tripTints = ["#D3E0F4", "#FAEDBE", "#D6ECDF", "#F7D9DC", "#E2DCF3"];

function listKeyOf(todo: Pick<Todo, "tripId" | "status">): ListKey {
  if (todo.tripId !== null) return todo.tripId;
  return todo.status ? "unsorted" : "inspiration";
}

function listTodos(todos: Todo[], key: ListKey): Todo[] {
  return todos
    .filter((todo) => listKeyOf(todo) === key)
    .toSorted((a, b) => a.priority - b.priority);
}

// A priority that sorts between two neighbours; null means that side has none.
function priorityBetween(before: number | null, after: number | null): number {
  if (before !== null && after !== null) return (before + after) / 2;
  if (before !== null) return before + 1;
  if (after !== null) return after - 1;
  return 1;
}

// A priority between two list neighbours that no other to-do holds. Priorities are
// unique across every list, so the gap is narrowed to the nearest priority of any to-do:
// the slot sits right after before (or right before after, at the top of the list).
function freePriority(
  before: number | null,
  after: number | null,
  others: number[],
): number {
  if (before !== null) {
    const higher = others.filter((priority) => priority > before);
    return priorityBetween(before, higher.length ? Math.min(...higher) : null);
  }
  if (after !== null) {
    const lower = others.filter((priority) => priority < after);
    return priorityBetween(lower.length ? Math.max(...lower) : null, after);
  }
  return priorityBetween(null, null);
}

function tripTint(tripId: string): string {
  let hash = 0;
  for (const char of tripId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tripTints[hash % tripTints.length];
}

const dotted = (date: string) => date.replaceAll("-", ".");

function tripDates({
  startDate,
  endDate,
}: Pick<TripDto, "startDate" | "endDate">): string {
  if (startDate === null) return "No dates yet";
  if (endDate === null) return dotted(startDate);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${dotted(startDate)} – ${dotted(sameYear ? endDate.slice(5) : endDate)}`;
}

export {
  freePriority,
  listKeyOf,
  listTodos,
  priorityBetween,
  tripDates,
  tripTint,
};
export type { ListKey };

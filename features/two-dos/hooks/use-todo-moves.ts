"use client";

import ky from "ky";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { useTrips } from "@/features/two-dos/hooks/use-trips";
import { toTodo, type Todo } from "@/features/two-dos/models/views";
import type { TodoPlacementRequest } from "@/features/two-dos/models/requests";
import type { TodoPlacementResponse } from "@/features/two-dos/models/responses";
import type { TripDto, TripResponse } from "@/features/two-dos/models/trip";

type TripFields = Pick<TripDto, "name" | "startDate" | "endDate">;
// What Undo puts back: the list a to-do was in and where it sat
type Placement = Pick<Todo, "id" | "tripId" | "status" | "priority">;

const maxPriority = (todos: Todo[]) =>
  todos.reduce((max, todo) => Math.max(max, todo.priority), 0);

// The server's answer, guessed ahead of it so the row moves at once.
function placed(todo: Todo, patch: TodoPlacementRequest, all: Todo[]): Todo {
  const tripId = patch.tripId === undefined ? todo.tripId : patch.tripId;
  let doneAt = todo.doneAt;
  if (patch.done === false) doneAt = null;
  else if (patch.done && !todo.status) doneAt = new Date().toISOString();
  return {
    ...todo,
    tripId,
    doneAt,
    status: patch.done ?? todo.status,
    priority:
      patch.priority ??
      (tripId !== todo.tripId ? maxPriority(all) + 1 : todo.priority),
  };
}

// Shows the request's error and reports failure, so a flow can stop without a toast of its own.
async function attempt(run: () => Promise<unknown>, fallback: string) {
  try {
    await run();
    return true;
  } catch (error) {
    console.error(error);
    toast.error(await getErrorMessage(error, fallback));
    return false;
  }
}

function toastWithUndo(message: string, undo: () => Promise<unknown>) {
  toast(message, {
    duration: 5000,
    action: {
      label: "Undo",
      onClick: () => void attempt(undo, "Failed to undo. Please try again."),
    },
  });
}

function useTodoMoves() {
  const {
    key: todosKey,
    todos,
    isLoading: todosLoading,
    mutate: mutateTodos,
  } = useTodos();
  const {
    key: tripsKey,
    trips,
    isLoading: tripsLoading,
    mutate: mutateTrips,
  } = useTrips();

  const place = (todoId: string, patch: TodoPlacementRequest) =>
    mutateTodos(
      async (current = []) => {
        const response = await ky
          .patch(`${todosKey}/${todoId}`, { json: patch, retry: 0 })
          .json<TodoPlacementResponse>();
        return current.map((todo) =>
          todo.id === todoId ? toTodo(response.todo) : todo,
        );
      },
      {
        optimisticData: (current = []) =>
          current.map((todo) =>
            todo.id === todoId ? placed(todo, patch, current) : todo,
          ),
        rollbackOnError: true,
        revalidate: false,
      },
    );

  const createTrip = async (fields: TripFields) => {
    const { trip } = await ky
      .post(tripsKey, { json: fields, retry: 0 })
      .json<TripResponse>();
    await mutateTrips((current = []) => [...current, trip], {
      revalidate: false,
    });
    return trip;
  };

  const updateTrip = (
    tripId: string,
    patch: Partial<TripFields> & { position?: number },
  ) =>
    mutateTrips(
      async (current = []) => {
        const { trip } = await ky
          .patch(`${tripsKey}/${tripId}`, { json: patch, retry: 0 })
          .json<TripResponse>();
        return current.map((other) => (other.id === tripId ? trip : other));
      },
      {
        optimisticData: (current = []) =>
          current
            .map((trip) => (trip.id === tripId ? { ...trip, ...patch } : trip))
            .toSorted((a, b) => a.position - b.position),
        rollbackOnError: true,
        revalidate: false,
      },
    );

  const deleteTrip = async (tripId: string) => {
    await mutateTrips(
      async (current = []) => {
        await ky.delete(`${tripsKey}/${tripId}`, { retry: 0 });
        return current.filter((trip) => trip.id !== tripId);
      },
      {
        optimisticData: (current = []) =>
          current.filter((trip) => trip.id !== tripId),
        rollbackOnError: true,
        revalidate: false,
      },
    );
    // The server cleared tripId on its stops; mirror it so they show in Inspiration or Unsorted
    await mutateTodos(
      (current = []) =>
        current.map((todo) =>
          todo.tripId === tripId ? { ...todo, tripId: null } : todo,
        ),
      { revalidate: false },
    );
  };

  // Undo: every to-do goes back to its list and spot, and a trip the move created goes away.
  const restore = async (before: Placement[], createdTripId?: string) => {
    for (const { id, tripId, status, priority } of before) {
      await place(id, { tripId, done: status, priority });
    }
    if (createdTripId) await deleteTrip(createdTripId);
  };

  // Moves one to-do and offers Undo; createdTripId is a trip made just for this move.
  const moveWithUndo = async (
    todo: Todo,
    patch: TodoPlacementRequest,
    message: string,
    createdTripId?: string,
  ) => {
    const moved = await attempt(
      () => place(todo.id, patch),
      "Failed to move the to-do. Please try again.",
    );
    if (moved) toastWithUndo(message, () => restore([todo], createdTripId));
    return moved;
  };

  return {
    todos,
    trips,
    loading: todosLoading || tripsLoading,
    todosKey,
    mutateTodos,
    place,
    createTrip,
    updateTrip,
    deleteTrip,
    restore,
    moveWithUndo,
    nextPriority: () => maxPriority(todos) + 1,
  };
}

export { attempt, toastWithUndo, useTodoMoves };
export type { TripFields };

"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { TodoDto } from "@/features/two-dos/models/responses";
import { Todo } from "@/features/two-dos/models/views";
import { DateTime } from "luxon";

function useTodo(id: string, config?: SWRConfiguration) {
  const key = `/api/todos/${id}`;
  const hook = useSWR<Todo>(
    key,
    async (url: string) => {
      const todo = await ky.get(url).json<TodoDto>();
      return {
        id: todo.id,
        images: todo.images,
        title: todo.title,
        description: todo.description,
        doneAt: todo.doneAt,
        createdAt: todo.createdAt,
        createdBy: todo.createdBy,
        updatedAt: todo.updatedAt,
        status:
          todo.doneAt !== null
            ? DateTime.fromISO(todo.doneAt) < DateTime.utc()
            : false,
      };
    },
    {
      errorRetryCount: 1,
      onError: (error: HTTPError) => {
        toast.error(error.message);
      },
      ...config,
    },
  );

  return {
    key,
    ...hook,
  };
}

export { useTodo };

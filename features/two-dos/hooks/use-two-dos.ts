"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { TodoResponse } from "@/features/two-dos/models/responses";
import { Todo } from "@/features/two-dos/models/views";
import { DateTime } from "luxon";

function useTodos(config?: SWRConfiguration) {
  const key = "/api/todos";
  const hook = useSWR<Todo[]>(
    key,
    async (url: string) => {
      const response = await ky.get(url).json<TodoResponse>();
      return response.todos.map((todo) => ({
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
      }));
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
    todos: hook.data ?? [],
  };
}

export { useTodos };

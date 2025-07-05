"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { TodoResponse } from "@/features/two-dos/models/responses";

function useTodos(config?: SWRConfiguration) {
  const key = "/api/todos";
  const hook = useSWR(key, async (url: string) => {
    const response = await ky.get(url).json<TodoResponse>();
    return response.todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      description: todo.description,
      doneAt: todo.doneAt,
      createdAt: todo.createdAt,
      createdBy: todo.createdBy,
      updatedAt: todo.updatedAt,
      status: !!todo.doneAt,
    }));
  }, {
    errorRetryCount: 1,
    onError: (error: HTTPError) => {
      toast.error(error.message);
    },
    ...config,
  });

  return {
    key,
    ...hook,
    todos: hook.data ?? [],
  };
}

export { useTodos };


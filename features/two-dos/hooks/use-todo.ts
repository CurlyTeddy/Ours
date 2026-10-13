"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { TodoDto } from "@/features/two-dos/models/responses";
import { Todo, toTodo } from "@/features/two-dos/models/views";

function useTodo(id: string, config?: SWRConfiguration) {
  const key = `/api/todos/${id}`;
  const hook = useSWR<Todo>(
    key,
    async (url: string) => {
      const todo = await ky.get(url).json<TodoDto>();
      return toTodo(todo);
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

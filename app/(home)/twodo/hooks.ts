"use client";

import { TodoResponse } from "@/app/api/todos/route";
import ky from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { Todo } from "@/app/(home)/twodo/columns";

function useTodos(config?: SWRConfiguration) {
  const { data, error, isLoading }: {
    data?: Todo[],
    error?: Error,
    isLoading: boolean
  } = useSWR("/api/todos", async (url) => {
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
    onError: (error) => {
      toast.error(error.message);
    },
    ...config,
  });

  return {
    todos: data ?? [],
    isLoading,
    error,
  };
}

export { useTodos };


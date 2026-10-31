import {
  todoLocationSchema,
  TodoLocation,
} from "@/features/two-dos/models/location";
import { DateTime } from "luxon";
import { z } from "zod/v4";
import type { TodoDto } from "@/features/two-dos/models/responses";
import { maxImageBytes } from "@/lib/image-upload";

// list is a ListKey: "inspiration", "unsorted" or a trip id
const todoFormSchema = z.object({
  title: z.string().trim().min(1, "Give it a title first"),
  list: z.string(),
  location: todoLocationSchema.nullable(),
  description: z.string(),
  images: z.array(
    z
      .file()
      .max(maxImageBytes)
      .mime(["image/gif", "image/jpeg", "image/png", "image/webp"]),
  ),
});

type TodoForm = z.infer<typeof todoFormSchema>;

export interface Todo {
  id: string;
  images: {
    key: string;
    url: string;
  }[];
  title: string;
  createdAt: string;
  createdBy: {
    name: string;
    imageUrl: string | null;
  };
  location: TodoLocation | null;
  tripId: string | null;
  priority: number;
  updatedAt: string;
  doneAt: string | null;
  description: string | null;
  status: boolean;
}

function toTodo(todo: TodoDto): Todo {
  return {
    id: todo.id,
    images: todo.images,
    title: todo.title,
    description: todo.description,
    location: todo.location,
    tripId: todo.tripId,
    priority: todo.priority,
    doneAt: todo.doneAt,
    createdAt: todo.createdAt,
    createdBy: todo.createdBy,
    updatedAt: todo.updatedAt,
    // A done date in the future is still a plan
    status:
      todo.doneAt !== null && DateTime.fromISO(todo.doneAt) < DateTime.utc(),
  };
}

export { todoFormSchema, toTodo };
export type { TodoForm };

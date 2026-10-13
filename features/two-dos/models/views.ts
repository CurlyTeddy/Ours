import { dateFormat } from "@/components/ui/popover-calendar";
import {
  todoLocationSchema,
  TodoLocation,
} from "@/features/two-dos/models/location";
import { DateTime } from "luxon";
import { z } from "zod/v4";
import type { TodoDto } from "@/features/two-dos/models/responses";

const maxFileSize = 1024 * 1024 * 5;

const timeFormat = `${dateFormat} HH:mm`;

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  location: todoLocationSchema,
  images: z.array(
    z
      .file()
      .max(maxFileSize)
      .mime(["image/gif", "image/jpeg", "image/png", "image/webp"]),
  ),
});

const updateSchema = z.object({
  ...createSchema.shape,
  doneAt: z
    .string()
    .refine((date) => !date || DateTime.fromFormat(date, dateFormat).isValid, {
      message: "Invalid date",
    })
    .nullable(),
});

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
  location: TodoLocation;
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
    doneAt: todo.doneAt,
    createdAt: todo.createdAt,
    createdBy: todo.createdBy,
    updatedAt: todo.updatedAt,
    // A done date in the future is still a plan
    status:
      todo.doneAt !== null && DateTime.fromISO(todo.doneAt) < DateTime.utc(),
  };
}

export { createSchema, updateSchema, maxFileSize, timeFormat, toTodo };

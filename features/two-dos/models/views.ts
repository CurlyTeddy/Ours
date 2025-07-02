import { DateTime } from "luxon";
import { z } from "zod/v4";

const maxFileSize = 1024 * 1024 * 1;

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  images: z.array(z.file().max(maxFileSize).mime(["image/gif", "image/jpeg", "image/png", "image/webp"])),
});

const updateSchema = createSchema.extend({
  doneAt: z.string().refine((date) => !date || DateTime.fromFormat(date, "MMM dd, yyyy").isValid, {
    message: "Invalid date",
  }),
});

export interface Todo {
  id: string
  title: string
  createdAt: string
  createdBy: string
  updatedAt: string
  doneAt: string | null
  description: string | null
  status: boolean
}

export { createSchema, updateSchema, maxFileSize };
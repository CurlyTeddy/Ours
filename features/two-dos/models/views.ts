import { dateFormat } from "@/components/ui/popover-calendar";
import { DateTime } from "luxon";
import { z } from "zod/v4";

const maxFileSize = 1024 * 1024 * 1;

const timeFormat = `${dateFormat} HH:mm`;

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  images: z.array(z.file().max(maxFileSize).mime(["image/gif", "image/jpeg", "image/png", "image/webp"])),
});

const updateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  doneAt: z.string().refine((date) => !date || DateTime.fromFormat(date, dateFormat).isValid, {
    message: "Invalid date",
  }).nullable(),
});

export interface Todo {
  id: string
  imageKeys: string[]
  title: string
  createdAt: string
  createdBy: string
  updatedAt: string
  doneAt: string | null
  description: string | null
  status: boolean
}

export { createSchema, updateSchema, maxFileSize, timeFormat };
import { DateTime } from "luxon";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

const updateSchema = createSchema.extend({
  doneAt: z.string().refine((date) => !date || DateTime.fromFormat(date, "MMM dd, yyyy").isValid, {
    message: "Invalid date",
  }),
});

export { createSchema, updateSchema };
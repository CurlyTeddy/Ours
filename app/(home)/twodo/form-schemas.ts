import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

export { createSchema };
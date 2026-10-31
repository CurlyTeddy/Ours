import { z } from "zod/v4";
import { todoLocationSchema } from "@/features/two-dos/models/location";
import { imageUploadSchema } from "@/lib/image-upload";

const namedImageUploadSchema = imageUploadSchema.extend({
  name: z.string().min(1),
});

const todoCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  location: todoLocationSchema.nullable(),
  tripId: z.string().nullable(),
  images: z.array(namedImageUploadSchema),
});

const todoUpdateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().nullable(),
  location: todoLocationSchema.nullable(),
  tripId: z.string().nullable(),
  imageNames: z.array(z.string().min(1, "Unexpected empty image key")),
  // One entry per name in imageNames that is not already stored; the route checks the match
  uploads: z.array(namedImageUploadSchema).default([]),
});

type TodoCreateRequest = z.input<typeof todoCreateSchema>;
type TodoUpdateRequest = z.input<typeof todoUpdateSchema>;

const todoPlacementSchema = z
  .object({
    tripId: z.string().nullable().optional(),
    done: z.boolean().optional(),
    priority: z.number({ error: "Invalid priority" }).optional(),
  })
  .refine(
    (body) =>
      body.tripId !== undefined ||
      body.done !== undefined ||
      body.priority !== undefined,
    { message: "Nothing to change" },
  );

type TodoPlacementRequest = z.infer<typeof todoPlacementSchema>;

export { todoCreateSchema, todoPlacementSchema, todoUpdateSchema };
export type { TodoCreateRequest, TodoPlacementRequest, TodoUpdateRequest };

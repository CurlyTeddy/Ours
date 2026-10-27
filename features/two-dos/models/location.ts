import type { Prisma } from "@prisma/client";
import { z } from "zod/v4";

const todoLocationSchema = z.object({
  name: z.string().min(1, "Location is required"),
  address: z.string().min(1, "Location address is required"),
  placeId: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

type TodoLocation = z.infer<typeof todoLocationSchema>;

const todoLocationSelect = {
  name: true,
  address: true,
  placeId: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.LocationSelect;

// A place without a Google id cannot be shared, so it gets its own row.
// shortcut: connectOrCreate is not atomic, so two first-time saves of one place at the same
// moment can hit the place_id unique index and fail; retry on P2002 if that ever shows up.
function toLocationWrite(
  location: TodoLocation,
): Prisma.LocationCreateNestedOneWithoutTodosInput {
  if (location.placeId === null) {
    return { create: location };
  }

  return {
    connectOrCreate: {
      where: { placeId: location.placeId },
      create: location,
    },
  };
}

export { todoLocationSchema, todoLocationSelect, toLocationWrite };
export type { TodoLocation };

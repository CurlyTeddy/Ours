import type { Prisma } from "@prisma/client";
import { getCachedSignedUrl } from "@/lib/s3-client";
import { todoLocationSelect } from "@/features/two-dos/models/location";
import type { TodoDto } from "@/features/two-dos/models/responses";

const todoInclude = {
  createdBy: { select: { name: true, image: true } },
  location: { select: todoLocationSelect },
} satisfies Prisma.TodoInclude;

async function toTodoDto(
  todo: Prisma.TodoGetPayload<{ include: typeof todoInclude }>,
): Promise<TodoDto> {
  const imageKeys = todo.imageKeys ? todo.imageKeys.split(",") : [];

  return {
    id: todo.todoId,
    title: todo.title,
    description: todo.description,
    location: todo.location,
    tripId: todo.tripId,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    doneAt: todo.doneAt ? todo.doneAt.toISOString() : null,
    priority: todo.priority,
    images: await Promise.all(
      imageKeys.map(async (key) => ({
        key,
        url: await getCachedSignedUrl(`two-do/${key}`),
      })),
    ),
    createdBy: {
      name: todo.createdBy.name,
      imageUrl:
        todo.createdBy.image !== null
          ? await getCachedSignedUrl(`avatar/${todo.createdBy.image}`)
          : null,
    },
  };
}

export { todoInclude, toTodoDto };

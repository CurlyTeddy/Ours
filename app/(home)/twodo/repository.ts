"use server";

import { z } from "zod";
import prisma from "@/lib/database-client";
import auth from "@/middleware";
import { createSchema } from "@/app/(home)/twodo/form-schemas";
import { revalidatePath } from "next/cache";
import { Todo } from "@/app/(home)/twodo/columns";

async function addTodo(previousMessage: string | undefined, formData: z.infer<typeof createSchema>): Promise<string | undefined> {
  const { title, description } = formData;
  const session = await auth();

  if (!session?.user?.id) {
    return "Unauthorized: You must be logged in to add a todo.";
  }

  const userId = session.user.id;

  try {
    await prisma.$transaction(async (txn) => {
      const maxPriority = await txn.todo.aggregate({
        _max: { priority: true },
      });
      await txn.todo.create({
        data: {
          title,
          description,
          createdById: userId,
          priority: (maxPriority._max.priority ?? 0) + 1,
        },
      });
    });
  } catch (error) {
    console.error("Error creating todo:", error);
    return "Failed to create a todo. Please try again later.";
  }

  revalidatePath("/twodo");
}

async function getTodos(): Promise<Todo[]> {
  return (await prisma.todo.findMany({
    orderBy: { priority: "asc" },
    include: {
      createdBy: {
        select: { name: true },
      }
    }
  })).map((todo) => ({
    id: todo.todoId,
    title: todo.title,
    description: todo.description,
    createdAt: todo.createdAt,
    createdBy: todo.createdBy.name,
    status: !!todo.doneAt,
    priority: todo.priority,
  }));
}

async function deleteTodos(todoIds: string[]) {
  try {
    await prisma.todo.deleteMany({
      where: {
        todoId: { in: todoIds },
      },
    });
  } catch (error) {
    console.log("Error deleting todos:", error);
    return "Failed to delete todos. Please try again later.";
  }

  revalidatePath("/twodo");
}

export { addTodo, getTodos, deleteTodos };
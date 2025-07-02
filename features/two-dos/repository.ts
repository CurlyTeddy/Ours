"use server";

import prisma from "@/lib/database-client";
import { revalidatePath } from "next/cache";

async function updateTodo(id: string, updatedTodo: { title: string; description?: string; doneAt?: Date | null }) {
  try {
    await prisma.todo.update({
      where: { todoId: id },
      data: {
        ...updatedTodo,
      },
    });
  } catch (error) {
    console.error("Error updating todo:", error);
    return "Failed to update todo. Please try again later.";
  }

  revalidatePath("/twodo");
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

export { updateTodo, deleteTodos };
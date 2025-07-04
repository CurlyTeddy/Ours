"use server";

import prisma from "@/lib/database-client";
import { revalidatePath } from "next/cache";

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

export { deleteTodos };
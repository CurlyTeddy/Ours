import { TodoUpdateRequest } from "@/features/two-dos/models/requests";
import { TodoUpdateResponse } from "@/features/two-dos/models/responses";
import prisma from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<TodoUpdateResponse | HttpErrorPayload>> {
  const { id } = await params;
  const requestPayload = await request.json() as TodoUpdateRequest;

  const validatedFields = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().nullable(),
    doneAt: z.string().refine((date) => DateTime.fromISO(date).isValid, {
      message: "Invalid date",
    }).nullable(),
  }).safeParse({
    title: requestPayload.title,
    description: requestPayload.description,
    doneAt: requestPayload.doneAt,
  });

  if (!validatedFields.success) {
    return NextResponse.json({
      message: validatedFields.error.issues[0].message,
      errors: validatedFields.error.issues,
    }, {
      status: 400,
    });
  }

  try {
    const updatedTodo = await prisma.todo.update({
      where: { todoId: id },
      data: {
        ...requestPayload,
      },
      include: {
        createdBy: {
          select: { name: true },
        }
      }
    });

    const todo = {
      id: updatedTodo.todoId,
      title: updatedTodo.title,
      description: updatedTodo.description,
      createdAt: updatedTodo.createdAt.toISOString(),
      updatedAt: updatedTodo.updatedAt.toISOString(),
      doneAt: updatedTodo.doneAt ? updatedTodo.doneAt.toISOString() : null,
      priority: updatedTodo.priority,
      imageKeys: updatedTodo.imageKeys ? updatedTodo.imageKeys.split(",") : null,
      createdById: updatedTodo.createdById,
      createdBy: updatedTodo.createdBy.name,
    };

    revalidatePath("/twodo");
    return NextResponse.json({
      todo,
    }, {
      status: 200,
    });
  } catch (error) {
    console.error("Error updating todo:", error);
    return NextResponse.json({
      message: "Failed to update todo. Please try again later.",
    }, {
      status: 500,
    });
  }
}

export { PUT };
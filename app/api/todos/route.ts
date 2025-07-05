import prisma from "@/lib/database-client";
import { auth } from "@/features/auth/auth";
import { createId } from "@paralleldrive/cuid2";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "@/lib/s3-client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { HttpErrorPayload } from "@/lib/error";
import { TodoCreateResponse, TodoDto, TodoResponse } from "@/features/two-dos/models/responses";
import { TodoCreateRequest } from "@/features/two-dos/models/requests";

async function GET(): Promise<NextResponse<TodoResponse | HttpErrorPayload>> {
  let todos: TodoDto[] = [];
  try {
    todos = (await prisma.todo.findMany({
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
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
      doneAt: todo.doneAt ? todo.doneAt.toISOString() : null,
      priority: todo.priority,
      imageKeys: todo.imageKeys ? todo.imageKeys.split(",") : null,
      createdById: todo.createdById,
      createdBy: todo.createdBy.name,
    }));
  } catch (error) {
    console.error("Error fetching todos:", error);
    return NextResponse.json({
      message: "Failed to fetch todos. Please try again later.",
    }, {
      status: 500,
    });
  }

  return NextResponse.json({ todos }, {
    status: 200,
  });
}

async function POST(request: NextRequest): Promise<NextResponse<TodoCreateResponse | HttpErrorPayload>> {
  const requestPayload = await request.json() as TodoCreateRequest;

  const validatedFields = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    imageNames: z.array(z.string()),
  }).safeParse({
    title: requestPayload.title,
    description: requestPayload.description,
    imageNames: requestPayload.imageNames,
  });

  if (!validatedFields.success) {
    return NextResponse.json({
      message: validatedFields.error.issues[0].message,
      validationIssues: validatedFields.error.issues
    }, {
      status: 400,
    });
  }
  
  const session = await auth();
  if (session?.user?.id === undefined) {
    return NextResponse.json({
      message: "Unauthorized. Please log in to create a todo.",
    }, {
      status: 401,
    });
  }

  const userId = session.user.id;
  const { title, description, imageNames } = validatedFields.data;
  const imageKeys = imageNames.map((name) => `${name}-${createId()}`);

  try {
    const payload = await prisma.$transaction(async (txn) => {
      const maxPriority = await txn.todo.aggregate({
        _max: { priority: true },
      });

      const newTodo = await txn.todo.create({
        include: {
          createdBy: {
            select: { name: true },
          },
        },
        data: {
          title,
          description,
          createdById: userId,
          priority: (maxPriority._max.priority ?? 0) + 1,
          imageKeys: imageKeys.join(","),
        },
      });

      const todo: TodoDto = {
        id: newTodo.todoId,
        title: newTodo.title,
        description: newTodo.description,
        createdAt: newTodo.createdAt.toISOString(),
        updatedAt: newTodo.updatedAt.toISOString(),
        doneAt: newTodo.doneAt ? newTodo.doneAt.toISOString() : null,
        priority: newTodo.priority,
        imageKeys: newTodo.imageKeys ? newTodo.imageKeys.split(",") : null,
        createdById: newTodo.createdById,
        createdBy: newTodo.createdBy.name,
      };

      const signedUrls = await Promise.all(imageKeys.map((key) => {
        return getSignedUrl(s3Client, new PutObjectCommand({
          Bucket: `images-${process.env.ENVIRONMENT ?? "dev"}`,
          Key: `two-do/${key}`,
        }), { expiresIn: 300 });
      }));

      return { todo, signedUrls };
    });

    return NextResponse.json(payload, {
      status: 200,
    });
  } catch (error) {
    console.error("Error creating todo:", error);
  }

  revalidatePath("/twodo");
  return NextResponse.json({
    message: "Failed to create a todo. Please try again later.",
  }, {
    status: 500,
  });
}

export { GET, POST };
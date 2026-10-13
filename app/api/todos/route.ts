import { prisma } from "@/lib/database-client";
import { createId } from "@paralleldrive/cuid2";
import { NextRequest, NextResponse } from "next/server";
import z from "zod/v4";
import s3Client, { bucket } from "@/lib/s3-client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { HttpErrorPayload } from "@/lib/error";
import {
  TodoCreateResponse,
  TodoResponse,
} from "@/features/two-dos/models/responses";
import { TodoCreateRequest } from "@/features/two-dos/models/requests";
import {
  todoLocationSchema,
  toLocationWrite,
} from "@/features/two-dos/models/location";
import { todoInclude, toTodoDto } from "@/features/two-dos/todo-dto";
import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function GET(): Promise<NextResponse<TodoResponse | HttpErrorPayload>> {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: { priority: "asc" },
      include: todoInclude,
    });

    const todoDto = await Promise.all(todos.map(toTodoDto));

    return NextResponse.json(
      { todos: todoDto },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error fetching todos:", error);
    return NextResponse.json(
      {
        message: "Failed to fetch todos. Please try again later.",
      },
      {
        status: 500,
      },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<TodoCreateResponse | HttpErrorPayload>> {
  const requestPayload = (await request.json()) as TodoCreateRequest;

  const validatedFields = z
    .object({
      title: z.string().min(1, "Title is required"),
      description: z.string().optional(),
      location: todoLocationSchema,
      imageNames: z.array(z.string()),
    })
    .safeParse({
      title: requestPayload.title,
      description: requestPayload.description,
      location: requestPayload.location,
      imageNames: requestPayload.imageNames,
    });

  if (!validatedFields.success) {
    return NextResponse.json(
      {
        message: validatedFields.error.issues[0].message,
      },
      {
        status: 400,
      },
    );
  }

  const cookiesStore = await cookies();
  const { user } = await validateSessionToken(
    cookiesStore.get("session")?.value,
  );
  if (user === null) {
    return NextResponse.json(
      {
        message: "Invalid or expired session.",
      },
      {
        status: 401,
      },
    );
  }

  const { title, description, location, imageNames } = validatedFields.data;
  const imageKeys = imageNames.map((name) => `${name}-${createId()}`);

  try {
    const payload = await prisma.$transaction(async (txn) => {
      const maxPriority = await txn.todo.aggregate({
        _max: { priority: true },
      });

      const newTodo = await txn.todo.create({
        include: todoInclude,
        data: {
          title,
          description,
          location: toLocationWrite(location),
          createdBy: { connect: { userId: user.id } },
          priority: (maxPriority._max.priority ?? 0) + 1,
          imageKeys: imageKeys.length > 0 ? imageKeys.join(",") : null,
        },
      });

      const todo = await toTodoDto(newTodo);

      const signedUrls = await Promise.all(
        imageKeys.map((key) => {
          return getSignedUrl(
            s3Client,
            new PutObjectCommand({
              Bucket: bucket,
              Key: `two-do/${key}`,
            }),
          );
        }),
      );

      return { todo, signedUrls };
    });

    return NextResponse.json(payload, {
      status: 200,
    });
  } catch (error) {
    console.error("Error creating todo:", error);
  }
  return NextResponse.json(
    {
      message: "Failed to create a todo. Please try again later.",
    },
    {
      status: 500,
    },
  );
}

export { GET, POST };

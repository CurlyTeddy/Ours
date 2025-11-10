import prisma from "@/lib/database-client";
import { createId } from "@paralleldrive/cuid2";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "@/lib/s3-client";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { HttpErrorPayload } from "@/lib/error";
import {
  TodoCreateResponse,
  TodoDto,
  TodoResponse,
} from "@/features/two-dos/models/responses";
import { TodoCreateRequest } from "@/features/two-dos/models/requests";
import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

async function GET(): Promise<NextResponse<TodoResponse | HttpErrorPayload>> {
  try {
    const todos = (
      await prisma.todo.findMany({
        orderBy: { priority: "asc" },
        include: {
          createdBy: {
            select: {
              name: true,
              image: true,
            },
          },
        },
      })
    ).map(async (todo) => ({
      id: todo.todoId,
      title: todo.title,
      description: todo.description,
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
      doneAt: todo.doneAt ? todo.doneAt.toISOString() : null,
      priority: todo.priority,
      images: await Promise.all(
        todo.imageKeys
          ? todo.imageKeys.split(",").map(async (key) => ({
              key,
              url: await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                  Key: `two-do/${key}`,
                }),
                {
                  expiresIn: 300,
                },
              ),
            }))
          : [],
      ),
      createdBy: {
        name: todo.createdBy.name,
        imageUrl:
          todo.createdBy.image !== null
            ? await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                  Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                  Key: `avatar/${todo.createdBy.image}`,
                }),
                {
                  expiresIn: 300,
                },
              )
            : null,
      },
    }));

    return NextResponse.json(
      { todos: await Promise.all(todos) },
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
      imageNames: z.array(z.string()),
    })
    .safeParse({
      title: requestPayload.title,
      description: requestPayload.description,
      imageNames: requestPayload.imageNames,
    });

  if (!validatedFields.success) {
    return NextResponse.json(
      {
        message: validatedFields.error.issues[0].message,
        validationIssues: validatedFields.error.issues,
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
            select: {
              name: true,
              image: true,
            },
          },
        },
        data: {
          title,
          description,
          createdById: user.id,
          priority: (maxPriority._max.priority ?? 0) + 1,
          imageKeys: imageKeys.length > 0 ? imageKeys.join(",") : null,
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
        images: await Promise.all(
          newTodo.imageKeys !== null
            ? newTodo.imageKeys.split(",").map(async (key) => ({
                key,
                url: await getSignedUrl(
                  s3Client,
                  new GetObjectCommand({
                    Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                    Key: `two-do/${key}`,
                  }),
                  {
                    expiresIn: 300,
                  },
                ),
              }))
            : [],
        ),
        createdBy: {
          name: newTodo.createdBy.name,
          imageUrl:
            newTodo.createdBy.image !== null
              ? await getSignedUrl(
                  s3Client,
                  new GetObjectCommand({
                    Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
                    Key: `avatar/${newTodo.createdBy.image}`,
                  }),
                  {
                    expiresIn: 300,
                  },
                )
              : null,
        },
      };

      const signedUrls = await Promise.all(
        imageKeys.map((key) => {
          return getSignedUrl(
            s3Client,
            new PutObjectCommand({
              Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
              Key: `two-do/${key}`,
            }),
            { expiresIn: 300 },
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

  revalidatePath("/twodo");
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

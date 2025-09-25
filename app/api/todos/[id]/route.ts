import { TodoUpdateRequest } from "@/features/two-dos/models/requests";
import { TodoUpdateResponse } from "@/features/two-dos/models/responses";
import prisma from "@/lib/database-client";
import { env } from "@/lib/env";
import { HttpErrorPayload } from "@/lib/error";
import { Prisma } from "@prisma/client";
import s3Client from "@/lib/s3-client";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@paralleldrive/cuid2";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<TodoUpdateResponse | HttpErrorPayload>> {
  const { id } = await params;
  const requestPayload = (await request.json()) as TodoUpdateRequest;

  const validatedFields = z
    .object({
      title: z.string().min(1, "Title is required"),
      description: z.string().nullable(),
      doneAt: z
        .string()
        .refine((date) => DateTime.fromISO(date).isValid, {
          message: "Invalid date",
        })
        .nullable(),
      imageNames: z.array(z.string().min(1, "Unexpected empty image key")),
    })
    .safeParse({
      title: requestPayload.title,
      description: requestPayload.description,
      doneAt: requestPayload.doneAt,
      imageNames: requestPayload.imageNames,
    });

  if (!validatedFields.success) {
    return NextResponse.json(
      {
        message: validatedFields.error.issues[0].message,
        errors: validatedFields.error.issues,
      },
      {
        status: 400,
      },
    );
  }

  try {
    const payload = await prisma.$transaction(async (txn) => {
      const todo = await txn.todo.findUnique({
        select: { imageKeys: true },
        where: { todoId: id },
      });

      if (todo === null) {
        return null;
      }

      const { imageNames, ...rest } = validatedFields.data;
      const oldImageKeys = todo.imageKeys ? todo.imageKeys.split(",") : [];
      const oldImageSet = new Set(oldImageKeys);
      const imageIntersection = new Set(
        imageNames.filter((name) => oldImageSet.has(name)),
      );
      const imagesToUpload = imageNames.map(
        (name) => [name, `${name}-${createId()}`] as [string, string],
      );
      const newImageKeys = new Map(
        imagesToUpload.filter(([name]) => !imageIntersection.has(name)),
      );

      // Database update must be before R2 operations to avoid side effect on R2 when the database update fails
      const updatedTodo = await txn.todo.update({
        where: { todoId: id },
        data: {
          ...rest,
          imageKeys: imageNames
            .map((name) =>
              newImageKeys.has(name) ? newImageKeys.get(name) : name,
            )
            .join(","),
        },
        include: {
          createdBy: {
            select: { name: true },
          },
        },
      });

      const bucket = `images-${env.NEXT_PUBLIC_ENVIRONMENT}`;
      await Promise.all(
        oldImageKeys
          .filter((key) => !imageIntersection.has(key))
          .map((key) => {
            const command = new DeleteObjectCommand({
              Bucket: bucket,
              Key: `two-do/${key}`,
            });
            return s3Client.send(command);
          }),
      );

      // Letting frontend to upload files can cause race condition. A user might delete an object
      // that is not yet uploaded by another user, this can be mitigated by adding retry mechanism
      // on the client side.
      const signedUrls = await Promise.all(
        imagesToUpload.map(([, key]) =>
          getSignedUrl(
            s3Client,
            new PutObjectCommand({
              Bucket: bucket,
              Key: `two-do/${key}`,
            }),
            { expiresIn: 300 },
          ),
        ),
      );

      return {
        updatedTodo,
        imagesToUpload: imagesToUpload.map(([name], index) => ({
          name,
          signedUrl: signedUrls[index],
        })),
      };
    });

    if (payload === null) {
      return NextResponse.json(
        {
          message: "Failed to upload todo. Cannot find the todo.",
        },
        {
          status: 404,
        },
      );
    }

    const { updatedTodo } = payload;

    const todo = {
      id: updatedTodo.todoId,
      title: updatedTodo.title,
      description: updatedTodo.description,
      createdAt: updatedTodo.createdAt.toISOString(),
      updatedAt: updatedTodo.updatedAt.toISOString(),
      doneAt: updatedTodo.doneAt ? updatedTodo.doneAt.toISOString() : null,
      priority: updatedTodo.priority,
      imageKeys: updatedTodo.imageKeys ? updatedTodo.imageKeys.split(",") : [],
      createdById: updatedTodo.createdById,
      createdBy: updatedTodo.createdBy.name,
    };

    revalidatePath("/twodo");
    return NextResponse.json(
      {
        todo,
        imagesToUpload: payload.imagesToUpload,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error updating todo:", error);
    return NextResponse.json(
      {
        message: "Failed to update todo. Please try again later.",
      },
      {
        status: 500,
      },
    );
  }
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<null | HttpErrorPayload>> {
  const { id } = await params;

  try {
    const todo = await prisma.todo.delete({
      where: {
        todoId: id,
      },
    });

    if (todo.imageKeys !== null) {
      await Promise.all(
        todo.imageKeys.split(",").map((key) => {
          const command = new DeleteObjectCommand({
            Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
            Key: `two-do/${key}`,
          });
          return s3Client.send(command);
        }),
      );
    }

    revalidatePath("/twodo");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting todos:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        {
          message: "Failed to delete todo. Cannot find the todo.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(
      {
        message: "Failed to delete todo. Please try again later.",
      },
      {
        status: 500,
      },
    );
  }
}

export { PUT, DELETE };

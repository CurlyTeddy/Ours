import { TodoUpdateRequest } from "@/features/two-dos/models/requests";
import {
  defaultLocationId,
  todoLocationSchema,
  toLocationWrite,
} from "@/features/two-dos/models/location";
import {
  TodoDto,
  TodoUpdateResponse,
} from "@/features/two-dos/models/responses";
import { todoInclude, toTodoDto } from "@/features/two-dos/todo-dto";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { Prisma } from "@prisma/client";
import s3Client, { bucket } from "@/lib/s3-client";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createId } from "@paralleldrive/cuid2";
import { DateTime } from "luxon";
import { NextRequest, NextResponse } from "next/server";
import z from "zod/v4";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<TodoDto | HttpErrorPayload>> {
  const { id } = await params;

  try {
    const todo = await prisma.todo.findUnique({
      where: { todoId: id },
      include: todoInclude,
    });

    if (todo === null) {
      return NextResponse.json({ message: "Todo not found." }, { status: 404 });
    }

    return NextResponse.json(await toTodoDto(todo), { status: 200 });
  } catch (error) {
    console.error("Error fetching todo:", error);
    return NextResponse.json(
      { message: "Failed to fetch todo. Please try again later." },
      { status: 500 },
    );
  }
}

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
      location: todoLocationSchema,
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
      location: requestPayload.location,
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
        select: { imageKeys: true, locationId: true },
        where: { todoId: id },
      });

      if (todo === null) {
        return null;
      }

      const {
        imageNames: newImageNames,
        location,
        ...rest
      } = validatedFields.data;
      const oldImageKeys = todo.imageKeys ? todo.imageKeys.split(",") : [];
      const oldImageSet = new Set(oldImageKeys);
      const imageIntersection = new Set(
        newImageNames.filter((name) => oldImageSet.has(name)),
      );
      const newImageKeys = new Map(
        newImageNames
          .filter((name) => !imageIntersection.has(name))
          // Keys are stored comma-joined, so a comma in a file name would split one key in two
          .map((name) => [name, `${name.replaceAll(",", "_")}-${createId()}`]),
      );

      // Database update must be before R2 operations to avoid side effect on R2 when the database update fails
      const updatedTodo = await txn.todo.update({
        where: { todoId: id },
        data: {
          ...rest,
          location: toLocationWrite(location),
          imageKeys:
            newImageNames.length > 0
              ? newImageNames
                  .map((name) =>
                    newImageKeys.has(name) ? newImageKeys.get(name) : name,
                  )
                  .join(",")
              : null,
        },
        include: todoInclude,
      });

      if (updatedTodo.locationId !== todo.locationId) {
        await txn.location.deleteMany({
          where: {
            locationId: todo.locationId,
            NOT: { locationId: defaultLocationId },
            todos: { none: {} },
          },
        });
      }

      // Letting frontend to upload files can cause race condition. A user might delete an object
      // that is not yet uploaded by another user, this can be mitigated by adding retry mechanism
      // on the client side.
      return {
        updatedTodo,
        removedKeys: oldImageKeys.filter((key) => !imageIntersection.has(key)),
        imagesToUpload: await Promise.all(
          Array.from(newImageKeys.entries()).map(async ([name, key]) => ({
            name,
            signedUrl: await getSignedUrl(
              s3Client,
              new PutObjectCommand({
                Bucket: bucket,
                Key: `two-do/${key}`,
              }),
              { expiresIn: 300 },
            ),
          })),
        ),
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

    // R2 deletes cannot roll back, so they run only after the update commits
    await Promise.all(
      payload.removedKeys.map((key) =>
        s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: `two-do/${key}`,
          }),
        ),
      ),
    );

    const todo = await toTodoDto(payload.updatedTodo);
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
    const todo = await prisma.$transaction(async (txn) => {
      const deletedTodo = await txn.todo.delete({
        where: {
          todoId: id,
        },
      });
      await txn.location.deleteMany({
        where: {
          locationId: deletedTodo.locationId,
          NOT: { locationId: defaultLocationId },
          todos: { none: {} },
        },
      });
      return deletedTodo;
    });

    if (todo.imageKeys !== null) {
      const imageKeys = todo.imageKeys.split(",");
      await Promise.all(
        imageKeys.map((key) => {
          const command = new DeleteObjectCommand({
            Bucket: bucket,
            Key: `two-do/${key}`,
          });
          return s3Client.send(command);
        }),
      );
    }
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

export { GET, PUT, DELETE };

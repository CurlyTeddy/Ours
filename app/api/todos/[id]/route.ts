import {
  todoPlacementSchema,
  todoUpdateSchema,
} from "@/features/two-dos/models/requests";
import { toLocationWrite } from "@/features/two-dos/models/location";
import {
  TodoDto,
  TodoPlacementResponse,
  TodoUpdateResponse,
} from "@/features/two-dos/models/responses";
import { todoInclude, toTodoDto } from "@/features/two-dos/todo-dto";
import {
  deleteOrphanLocation,
  isPrismaError,
  nextPriority,
  spotTakenMessage,
  tripMissing,
} from "@/features/two-dos/queries";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { parseBody } from "@/lib/parse-body";
import { deleteObjects, presignImagePut } from "@/lib/s3-client";
import { createId } from "@paralleldrive/cuid2";
import { NextRequest, NextResponse } from "next/server";

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
  const validatedFields = todoUpdateSchema.safeParse(await request.json());

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
        select: { imageKeys: true, locationId: true, tripId: true },
        where: { todoId: id },
      });

      if (todo === null) {
        return "missing" as const;
      }

      const {
        imageNames: newImageNames,
        uploads,
        location,
        tripId,
        ...rest
      } = validatedFields.data;
      if (tripId !== null && (await tripMissing(txn, tripId))) {
        return "trip" as const;
      }

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
      const newUploads = [];
      for (const [name, key] of newImageKeys) {
        const matches = uploads.filter((upload) => upload.name === name);
        if (matches.length !== 1) {
          return "details" as const;
        }
        newUploads.push({ name, key, upload: matches[0] });
      }

      // Database update must be before R2 operations to avoid side effect on R2 when the database update fails
      const updatedTodo = await txn.todo.update({
        where: { todoId: id },
        data: {
          ...rest,
          location: location ? toLocationWrite(location) : { disconnect: true },
          trip:
            tripId !== null ? { connect: { tripId } } : { disconnect: true },
          // A to-do that changes list goes to the end of its new list
          priority:
            tripId !== todo.tripId ? await nextPriority(txn) : undefined,
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
        await deleteOrphanLocation(txn, todo.locationId);
      }

      // Letting frontend to upload files can cause race condition. A user might delete an object
      // that is not yet uploaded by another user, this can be mitigated by adding retry mechanism
      // on the client side.
      return {
        updatedTodo,
        removedKeys: oldImageKeys.filter((key) => !imageIntersection.has(key)),
        imagesToUpload: await Promise.all(
          newUploads.map(async ({ name, key, upload }) => ({
            name,
            signedUrl: await presignImagePut(`two-do/${key}`, upload),
          })),
        ),
      };
    });

    if (payload === "missing") {
      return NextResponse.json(
        {
          message: "Failed to upload todo. Cannot find the todo.",
        },
        {
          status: 404,
        },
      );
    }
    if (payload === "trip") {
      return NextResponse.json({ message: "Trip not found." }, { status: 400 });
    }
    if (payload === "details") {
      return NextResponse.json(
        { message: "Missing image details" },
        { status: 400 },
      );
    }

    // R2 deletes cannot roll back, so they run only after the update commits
    await deleteObjects(payload.removedKeys.map((key) => `two-do/${key}`));

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

// Moves a to-do between lists, ticks it, or reorders it, without touching its content.
async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<TodoPlacementResponse | HttpErrorPayload>> {
  const { id } = await params;
  const parsed = await parseBody(request, todoPlacementSchema);
  if ("error" in parsed) return parsed.error;
  const { tripId, done, priority } = parsed.data;

  try {
    const result = await prisma.$transaction(async (txn) => {
      const todo = await txn.todo.findUnique({
        select: { doneAt: true, tripId: true },
        where: { todoId: id },
      });
      if (todo === null) return "missing" as const;
      if (typeof tripId === "string" && (await tripMissing(txn, tripId))) {
        return "trip" as const;
      }

      const now = new Date();
      // A done date in the future is still a plan, so ticking it moves the date to now
      const alreadyDone = todo.doneAt !== null && todo.doneAt < now;
      let doneAt: Date | null | undefined;
      if (done === false) doneAt = null;
      else if (done && !alreadyDone) doneAt = now;
      const moved = tripId !== undefined && tripId !== todo.tripId;
      return txn.todo.update({
        where: { todoId: id },
        data: {
          tripId,
          doneAt,
          priority: priority ?? (moved ? await nextPriority(txn) : undefined),
        },
        include: todoInclude,
      });
    });

    if (result === "missing") {
      return NextResponse.json({ message: "Todo not found." }, { status: 404 });
    }
    if (result === "trip") {
      return NextResponse.json({ message: "Trip not found." }, { status: 400 });
    }
    return NextResponse.json(
      { todo: await toTodoDto(result) },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error placing todo:", error);
    if (isPrismaError(error, "P2002")) {
      return NextResponse.json({ message: spotTakenMessage }, { status: 409 });
    }
    return NextResponse.json(
      { message: "Failed to update todo. Please try again later." },
      { status: 500 },
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
      await deleteOrphanLocation(txn, deletedTodo.locationId);
      return deletedTodo;
    });

    if (todo.imageKeys !== null) {
      await deleteObjects(
        todo.imageKeys.split(",").map((key) => `two-do/${key}`),
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting todos:", error);

    if (isPrismaError(error, "P2025")) {
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

export { GET, PUT, PATCH, DELETE };

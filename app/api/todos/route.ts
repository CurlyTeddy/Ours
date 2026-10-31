import { prisma } from "@/lib/database-client";
import { createId } from "@paralleldrive/cuid2";
import { NextRequest, NextResponse } from "next/server";
import { presignImagePut } from "@/lib/s3-client";
import { HttpErrorPayload } from "@/lib/error";
import {
  TodoCreateResponse,
  TodoResponse,
} from "@/features/two-dos/models/responses";
import { todoCreateSchema } from "@/features/two-dos/models/requests";
import { toLocationWrite } from "@/features/two-dos/models/location";
import { nextPriority, tripMissing } from "@/features/two-dos/queries";
import { todoInclude, toTodoDto } from "@/features/two-dos/todo-dto";
import { validateSessionToken } from "@/features/auth/session";
import { cookies } from "next/headers";

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
  const validatedFields = todoCreateSchema.safeParse(await request.json());

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

  const { title, description, location, tripId, images } = validatedFields.data;
  // Keys are stored comma-joined, so a comma in a file name would split one key in two
  const imageKeys = images.map(
    ({ name }) => `${name.replaceAll(",", "_")}-${createId()}`,
  );

  try {
    const payload = await prisma.$transaction(async (txn) => {
      if (tripId !== null && (await tripMissing(txn, tripId))) {
        return null;
      }

      const newTodo = await txn.todo.create({
        include: todoInclude,
        data: {
          title,
          description,
          location: location ? toLocationWrite(location) : undefined,
          trip: tripId !== null ? { connect: { tripId } } : undefined,
          createdBy: { connect: { userId: user.id } },
          priority: await nextPriority(txn),
          imageKeys: imageKeys.length > 0 ? imageKeys.join(",") : null,
        },
      });

      const todo = await toTodoDto(newTodo);

      const signedUrls = await Promise.all(
        imageKeys.map((key, index) =>
          presignImagePut(`two-do/${key}`, images[index]),
        ),
      );

      return { todo, signedUrls };
    });

    if (payload === null) {
      return NextResponse.json({ message: "Trip not found." }, { status: 400 });
    }

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

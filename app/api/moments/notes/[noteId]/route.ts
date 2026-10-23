import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { deleteObjects } from "@/lib/s3-client";
import { HttpErrorPayload } from "@/lib/error";
import {
  notePositionSchema,
  noteSaveSchema,
} from "@/features/moments/models/requests";
import type {
  Note,
  NoteSaveResponse,
} from "@/features/moments/models/responses";
import {
  isPrismaError,
  noteInclude,
  photoUploadUrl,
  toNote,
  toNoteUpdate,
} from "@/features/moments/note-mapping";

interface DeleteResponse {
  success: boolean;
}

interface Params {
  params: Promise<{ noteId: string }>;
}

const notFound = () =>
  NextResponse.json({ message: "Note not found." }, { status: 404 });

const invalidNote = () =>
  NextResponse.json({ message: "Invalid note" }, { status: 400 });

async function PUT(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse<NoteSaveResponse | HttpErrorPayload>> {
  const body: unknown = await request.json().catch(() => null);
  const validatedFields = noteSaveSchema.safeParse(body);

  if (!validatedFields.success) {
    return invalidNote();
  }

  try {
    const { noteId } = await params;
    const { previousPhotoKey, note, uploadUrl } = await prisma.$transaction(
      async (txn) => {
        const previous = await txn.momentNote.findUnique({
          where: { noteId },
          select: { photoKey: true },
        });
        // A missing note makes this update throw P2025.
        const note = await txn.momentNote.update({
          where: { noteId },
          data: toNoteUpdate(validatedFields.data),
          include: noteInclude,
        });
        const uploadUrl =
          validatedFields.data.photo === "new" && note.photoKey !== null
            ? await photoUploadUrl(note.photoKey)
            : null;
        return {
          previousPhotoKey: previous?.photoKey ?? null,
          note,
          uploadUrl,
        };
      },
    );

    // R2 deletes cannot roll back, so this runs only after the update commits
    if (previousPhotoKey !== null && previousPhotoKey !== note.photoKey) {
      await deleteObjects([previousPhotoKey]);
    }

    return NextResponse.json({ note: await toNote(note), uploadUrl });
  } catch (error) {
    console.error("Failed to update note:", error);
    if (isPrismaError(error, "P2025")) {
      return notFound();
    }

    return NextResponse.json(
      { message: "Failed to update note" },
      { status: 500 },
    );
  }
}

async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse<Note | HttpErrorPayload>> {
  const body: unknown = await request.json().catch(() => null);
  const validatedFields = notePositionSchema.safeParse(body);

  if (!validatedFields.success) {
    return invalidNote();
  }

  try {
    const { noteId } = await params;
    const note = await prisma.momentNote.update({
      where: { noteId },
      data: validatedFields.data,
      include: noteInclude,
    });

    return NextResponse.json(await toNote(note));
  } catch (error) {
    console.error("Failed to update note:", error);
    if (isPrismaError(error, "P2025")) {
      return notFound();
    }

    return NextResponse.json(
      { message: "Failed to update note" },
      { status: 500 },
    );
  }
}

async function DELETE(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse<DeleteResponse | HttpErrorPayload>> {
  try {
    const { noteId } = await params;
    const note = await prisma.momentNote.delete({ where: { noteId } });

    if (note.photoKey !== null) {
      await deleteObjects([note.photoKey]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    if (isPrismaError(error, "P2025")) {
      return notFound();
    }

    return NextResponse.json(
      { message: "Failed to delete note" },
      { status: 500 },
    );
  }
}

export { PUT, PATCH, DELETE };

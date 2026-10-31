import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { validateSessionToken } from "@/features/auth/session";
import { noteCreateSchema } from "@/features/moments/models/requests";
import type {
  NoteListResponse,
  NoteSaveResponse,
} from "@/features/moments/models/responses";
import {
  invalidNoteMessage,
  noteInclude,
  toNote,
  toNoteCreate,
} from "@/features/moments/note-mapping";
import { presignImagePut } from "@/lib/s3-client";

async function GET(): Promise<
  NextResponse<NoteListResponse | HttpErrorPayload>
> {
  try {
    const notes = await prisma.momentNote.findMany({
      include: noteInclude,
      orderBy: [{ z: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ notes: await Promise.all(notes.map(toNote)) });
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json(
      { message: "Failed to fetch notes" },
      { status: 500 },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<NoteSaveResponse | HttpErrorPayload>> {
  const cookieStore = await cookies();
  const { user } = await validateSessionToken(
    cookieStore.get("session")?.value,
  );

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // A malformed body parses to null, which the schema rejects like any bad input.
  const body: unknown = await request.json().catch(() => null);
  const validatedFields = noteCreateSchema.safeParse(body);

  if (!validatedFields.success) {
    return NextResponse.json(
      { message: invalidNoteMessage(validatedFields.error) },
      { status: 400 },
    );
  }

  try {
    const { note, uploadUrl } = await prisma.$transaction(async (txn) => {
      const { _max } = await txn.momentNote.aggregate({ _max: { z: true } });
      const note = await txn.momentNote.create({
        data: toNoteCreate(
          validatedFields.data,
          user.id,
          _max.z !== null ? _max.z + 1 : 0,
        ),
        include: noteInclude,
      });
      // The browser PUTs the file here after the note row commits, as profile and Two-Dos do.
      // Signed inside the transaction, so a signing failure leaves no row without its upload URL.
      const { photoFile } = validatedFields.data;
      const uploadUrl =
        note.photoKey !== null && photoFile !== null
          ? await presignImagePut(note.photoKey, photoFile)
          : null;
      return { note, uploadUrl };
    });

    return NextResponse.json({ note: await toNote(note), uploadUrl });
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json(
      { message: "Failed to create note" },
      { status: 500 },
    );
  }
}

export { GET, POST };

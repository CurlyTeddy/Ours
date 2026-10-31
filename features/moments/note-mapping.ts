import { Prisma } from "@prisma/client";
import type { z } from "zod/v4";
import { createId } from "@paralleldrive/cuid2";
import { getCachedSignedUrl } from "@/lib/s3-client";
import type {
  NoteColor,
  NoteCreateRequest,
  NotePattern,
  NotePlace,
  NoteSaveRequest,
  NoteSong,
} from "@/features/moments/models/requests";
import type { Note } from "@/features/moments/models/responses";

const noteInclude = {
  author: { select: { userId: true, name: true, image: true } },
  location: {
    select: {
      name: true,
      address: true,
      placeId: true,
      latitude: true,
      longitude: true,
    },
  },
  song: true,
} satisfies Prisma.MomentNoteInclude;

type NoteRow = Prisma.MomentNoteGetPayload<{ include: typeof noteInclude }>;

// Places and songs are shared rows: an existing one wins and keeps its stored details.
// shortcut: connectOrCreate is not atomic, so two first-time saves of one place or song at the
// same moment can hit the unique index and answer 500; retry on P2002 if that ever shows up.
const placeWrite = (place: NotePlace) => ({
  connectOrCreate: { where: { placeId: place.placeId }, create: place },
});

const songWrite = (song: NoteSong) => ({
  connectOrCreate: { where: { videoId: song.videoId }, create: song },
});

// Keys are made here, never taken from the client, so a note can only ever point at its own object.
const newPhotoKey = () => `notes/${createId()}`;

// Photo problems keep their message so the editor can say what was wrong; the rest stay generic.
const invalidNoteMessage = (error: z.ZodError) =>
  error.issues.find((issue) => issue.path[0] === "photoFile")?.message ??
  "Invalid note";

// On create a missing place or song is simply left out, and "keep" has nothing to keep.
function toNoteCreate(
  // photoFile only signs the upload URL; it is not a column
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { song, place, photo, photoFile, ...content }: NoteCreateRequest,
  authorId: string,
  z: number,
): Prisma.MomentNoteCreateInput {
  return {
    ...content,
    z,
    photoKey: photo === "new" ? newPhotoKey() : null,
    author: { connect: { userId: authorId } },
    ...(place ? { location: placeWrite(place) } : {}),
    ...(song ? { song: songWrite(song) } : {}),
  };
}

// On update a missing place or song disconnects the old one.
function toNoteUpdate({
  song,
  place,
  photo,
  // photoFile only signs the upload URL; it is not a column
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  photoFile,
  ...content
}: NoteSaveRequest): Prisma.MomentNoteUpdateInput {
  return {
    ...content,
    ...(photo === "keep"
      ? {}
      : { photoKey: photo === "new" ? newPhotoKey() : null }),
    location: place ? placeWrite(place) : { disconnect: true },
    song: song ? songWrite(song) : { disconnect: true },
  };
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

async function toNote(row: NoteRow): Promise<Note> {
  const [photoUrl, authorImageUrl] = await Promise.all([
    row.photoKey !== null ? getCachedSignedUrl(row.photoKey) : null,
    row.author.image !== null
      ? getCachedSignedUrl(`avatar/${row.author.image}`)
      : null,
  ]);
  const { location } = row;

  return {
    noteId: row.noteId,
    text: row.text,
    color: row.color as NoteColor,
    pattern: row.pattern as NotePattern,
    photoKey: row.photoKey,
    photoUrl,
    song: row.song && {
      videoId: row.song.videoId,
      title: row.song.title,
      channelTitle: row.song.channelTitle,
      thumbnailUrl: row.song.thumbnailUrl,
    },
    // Notes only ever link a location by its Google placeId, never Two-Dos' default row.
    place:
      location?.placeId != null
        ? {
            name: location.name,
            address: location.address,
            placeId: location.placeId,
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : null,
    date: row.date,
    x: row.x,
    y: row.y,
    rotation: row.rotation,
    z: row.z,
    author: {
      id: row.author.userId,
      name: row.author.name,
      imageUrl: authorImageUrl,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export {
  invalidNoteMessage,
  isPrismaError,
  noteInclude,
  toNote,
  toNoteCreate,
  toNoteUpdate,
};

import { describe, expect, test, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/s3-client", () => ({
  default: {},
  getCachedSignedUrl: vi.fn(async (key: string) => `https://signed/${key}`),
}));
import {
  noteInclude,
  toNote,
  toNoteCreate,
  toNoteUpdate,
} from "@/features/moments/note-mapping";
import type {
  NoteCreateRequest,
  NoteSaveRequest,
} from "@/features/moments/models/requests";

type NoteRow = Prisma.MomentNoteGetPayload<{ include: typeof noteInclude }>;

const song = {
  videoId: "vid1",
  title: "Playing God",
  channelTitle: "Polyphia",
  thumbnailUrl: "https://i.ytimg.com/vi/vid1/hqdefault.jpg",
};
const clip = { startSeconds: 42, endSeconds: 72 };
const save: NoteSaveRequest = {
  text: "hello",
  color: "mist",
  pattern: "plain",
  photo: "none",
  photoFile: null,
  song,
  songClip: clip,
  place: null,
  date: null,
};
const create: NoteCreateRequest = { ...save, x: 1, y: 2, rotation: 0 };
const row = (songStartSeconds: number | null, songEndSeconds: number | null) =>
  ({
    noteId: "n1",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    authorId: "u1",
    author: { userId: "u1", name: "Teddy", image: null },
    text: "hello",
    color: "mist",
    pattern: "plain",
    photoKey: null,
    songVideoId: song.videoId,
    song,
    songStartSeconds,
    songEndSeconds,
    locationId: null,
    location: null,
    date: null,
    x: 0,
    y: 0,
    rotation: 0,
    z: 0,
  }) as unknown as NoteRow;

describe("R1/R2: toNoteCreate", () => {
  test("writes the clip into the two columns", () => {
    const data = toNoteCreate(create, "u1", 0) as Record<string, unknown>;

    expect(data.songStartSeconds).toBe(42);
    expect(data.songEndSeconds).toBe(72);
    expect(data).not.toHaveProperty("songClip");
  });

  test("leaves both columns out when the clip is null", () => {
    const data = toNoteCreate({ ...create, songClip: null }, "u1", 0) as Record<
      string,
      unknown
    >;

    expect(data.songStartSeconds ?? null).toBeNull();
    expect(data.songEndSeconds ?? null).toBeNull();
    expect(data).not.toHaveProperty("songClip");
  });
});

describe("R1/R4: toNoteUpdate", () => {
  test("writes the clip into the two columns", () => {
    const data = toNoteUpdate(save) as Record<string, unknown>;

    expect(data.songStartSeconds).toBe(42);
    expect(data.songEndSeconds).toBe(72);
    expect(data).not.toHaveProperty("songClip");
  });

  test("a null clip clears both columns", () => {
    const data = toNoteUpdate({ ...save, songClip: null }) as Record<
      string,
      unknown
    >;

    expect(data).toHaveProperty("songStartSeconds", null);
    expect(data).toHaveProperty("songEndSeconds", null);
  });

  test("no song (and so no clip) clears both columns", () => {
    const data = toNoteUpdate({
      ...save,
      song: null,
      songClip: null,
    }) as Record<string, unknown>;

    expect(data).toHaveProperty("songStartSeconds", null);
    expect(data).toHaveProperty("songEndSeconds", null);
  });
});

describe("R4: toNote", () => {
  test("both columns set gives songClip", async () => {
    expect((await toNote(row(42, 72))).songClip).toEqual(clip);
  });

  test("a clip starting at 0:00 is kept", async () => {
    expect((await toNote(row(0, 30))).songClip).toEqual({
      startSeconds: 0,
      endSeconds: 30,
    });
  });

  test.each([
    ["both null (an older note)", null, null],
    ["only the start", 42, null],
    ["only the end", null, 72],
  ])("%s gives null", async (_, start, end) => {
    expect((await toNote(row(start, end))).songClip).toBeNull();
  });
});
